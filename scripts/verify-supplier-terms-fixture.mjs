// Regression harness: synthetic documents only in the existing isolated audit DB.
// This entrypoint is never imported by the application or enabled through an HTTP flag.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';
import {PrismaClient} from '@prisma/client';
import {auditEnvironment, root} from './lib/registration-resume-fixture.mjs';
import {completeFixtureOrganization} from './lib/organization-profile-fixture.mjs';

// Reuse a verified web build by choosing its loopback API port; never reuse an
// existing API because this harness owns the synthetic legal-document provider.
const apiPort = Number(process.env.E2E_SUPPLIER_TERMS_API_PORT ?? 4112);
assert.ok(Number.isInteger(apiPort) && apiPort >= 1024 && apiPort <= 65535);
const env = auditEnvironment();
Object.assign(env, {API_HOST:'127.0.0.1',API_PORT:String(apiPort),JWT_REQUIRE_MFA:'false',CORS_ORIGINS:'http://127.0.0.1:3102,http://127.0.0.1:3100',LOCAL_STORAGE_PATH:path.join(root,'.tmp/supplier-terms-storage')});
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env,env);
const db = new PrismaClient({datasourceUrl:env.DATABASE_URL});
const [identity] = await db.$queryRaw`SELECT current_database() AS database, current_schema() AS schema, to_regclass('public."SupplierTermsAcceptance"') IS NOT NULL AS ready`;
assert.deepEqual(identity,{database:'dentmarket_audit_20260914',schema:'public',ready:true});
async function free(port) { const server=createServer(); await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>server.close(resolve)); }
for(const port of [apiPort,3102,3100]) await free(port);
const require=createRequire(import.meta.url);
require('reflect-metadata');
const {createMarketplaceApp}=require('../apps/api/dist/src/bootstrap.js');
const {SupplierLegalDocuments,buildSupplierLegalBundle,supplierLegalDocuments}=require('../apps/api/dist/src/modules/agreements/supplier-legal-documents.js');
const {MarketplaceAgreementsService}=require('../apps/api/dist/src/modules/agreements/marketplace-agreements.service.js');
const {passwordHash}=require('../apps/api/dist/src/modules/identity/password-codec.js');
const app=await createMarketplaceApp();
const legal=app.get(SupplierLegalDocuments);
const published=buildSupplierLegalBundle(supplierLegalDocuments.map(item=>({...item,status:'PUBLISHED',version:'test-1',content:Array.from({length:35},(_,i)=>`ТЕСТОВЫЙ ТЕКСТ, НЕ ЮРИДИЧЕСКИЙ ДОКУМЕНТ. ${item.title}. Пункт ${i+1}: контроль просмотра и сохранения неизменяемой редакции.`).join('\n\n')})));
let current=published; legal.current=()=>current;
const accounts=new Map(), children=[], runId=`terms_${Date.now()}`, issued=[];
let count=0,stopping=false;
async function request(route,body,account,expected=200,headers={}) {
  const response=await fetch(`http://127.0.0.1:${apiPort}/api`+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(account?{authorization:`Bearer ${account.session.accessToken}`} : {}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(response.status,expected,`${route}: ${response.status}, expected ${expected}; body omitted`);
  return response.headers.get('content-type')?.includes('application/json')?response.json():response.text();
}
async function account(key,capability='SUPPLIER') {
  if(accounts.has(key)) return accounts.get(key);
  const password=randomBytes(24).toString('base64url');
  const user=await db.user.create({data:{email:`${runId}_${++count}@example.invalid`,displayName:`Представитель ${key}`,emailVerifiedAt:new Date(),passwordHash:passwordHash(password)}});issued.push(user.id);
  const organization=await db.organization.create({data:{bin:`96${String(Date.now()).slice(-8)}${String(count).padStart(2,'0')}`,legalName:`Тест ${key} ${runId}`,displayName:`Тест ${key}`,capabilities:{create:{capability}},...(capability==='SUPPLIER'?{supplierProfile:{create:{}}}: {})}});
  if(capability==='SUPPLIER') {
    await completeFixtureOrganization(db,organization.id);
    const city=await db.city.findFirstOrThrow({orderBy:{id:'asc'}});
    await db.warehouse.create({data:{supplierOrganizationId:organization.id,code:'TEST',name:'Synthetic warehouse',cityId:city.id,addressLine:'Synthetic warehouse street 1',timezone:'Asia/Almaty'}});
    await db.organizationCredential.create({data:{organizationId:organization.id,type:'REGISTRATION_CERTIFICATE',number:`synthetic-${runId}-${count}`,status:'VERIFIED',verifiedAt:new Date(),metadata:{fixture:true}}});
  }
  const codes=capability==='MARKETPLACE_OPERATOR'?(await db.permission.findMany({select:{code:true}})).map(item=>item.code):['organization.view','document.view','document.sign','supplier.profile.manage'];
  const role=await db.role.create({data:{organizationId:organization.id,code:'terms_test',name:'Synthetic regression role',permissions:{create:codes.map(code=>({permission:{connect:{code}}}))}}});
  await db.organizationMembership.create({data:{organizationId:organization.id,userId:user.id,status:'ACTIVE',isPrimary:true,acceptedAt:new Date(),roles:{create:{roleId:role.id}}}});
  const session=await request('/auth/login',{email:user.email,password},undefined,201);
  const value={user,organization,session};accounts.set(key,value);return value;
}
const acceptanceInput=()=>({organizationVersion:1,bundleHash:current.hash,reviewedDocuments:current.documents.map(({code,hash})=>({code,hash})),acknowledged:true,actsForOrganization:true,representativeAuthority:'Руководитель — тестовые полномочия'});
async function apiTests() {
  const seller=await account('api'), foreign=await account('foreign'), operator=await account('operator','MARKETPLACE_OPERATOR');
  await request('/supplier-terms/current',undefined,undefined,401,{'x-user-id':seller.user.id,'x-organization-id':seller.organization.id});
  await request('/supplier-terms/current',undefined,seller,401,{'x-organization-id':foreign.organization.id});
  await request('/supplier-terms/operator/acceptances',undefined,seller,403);
  await request('/marketplace-agreements',{},seller,403); // no document.manage and no access to legacy generator
  current=buildSupplierLegalBundle(supplierLegalDocuments);
  await request('/supplier-terms/acceptances',acceptanceInput(),seller,409);
  current=published;
  await request('/supplier-terms/acceptances',{...acceptanceInput(),bundleHash:'0'.repeat(64)},seller,409);
  await request('/supplier-terms/acceptances',{...acceptanceInput(),reviewedDocuments:current.documents.map(()=>({code:current.documents[0].code,hash:current.documents[0].hash}))},seller,409);
  const receipt=await request('/supplier-terms/acceptances',acceptanceInput(),seller,201);
  const replay=await request('/supplier-terms/acceptances',acceptanceInput(),seller,201);assert.equal(replay.id,receipt.id);
  assert.equal(await db.auditLog.count({where:{entityId:receipt.id,action:'supplier_terms.accepted'}}),1);
  assert.equal(await db.outboxEvent.count({where:{aggregateId:receipt.id,eventType:'SupplierTermsAccepted'}}),1);
  const gate=app.get(MarketplaceAgreementsService);
  await assert.rejects(()=>gate.assertActive(seller.organization.id));
  const review={expectedVersion:1,status:'APPROVED',organizationVerified:true,representativeVerified:true,reason:'Synthetic organization and authority verified'};
  await request(`/supplier-terms/operator/acceptances/${receipt.id}/review`,review,seller,403);
  await request(`/supplier-terms/operator/acceptances/${receipt.id}/review`,{...review,representativeVerified:false},operator,400);
  await request(`/supplier-terms/operator/acceptances/${receipt.id}/review`,review,operator,201);
  await gate.assertActive(seller.organization.id);
  assert.ok((await gate.activeSupplierIds()).includes(seller.organization.id));
  await request(`/supplier-terms/operator/acceptances/${receipt.id}/review`,review,operator,409);
  await request(`/supplier-terms/acceptances/${receipt.id}/download`,undefined,foreign,404);
  const text=await request(`/supplier-terms/acceptances/${receipt.id}/download`,undefined,seller);assert.ok(text.includes(published.documents[0].content));
  await request(`/supplier-terms/operator/acceptances/${receipt.id}/review`,{...review,expectedVersion:2,status:'SUSPENDED'},operator,201);
  await assert.rejects(()=>gate.assertActive(seller.organization.id));
  assert.ok(!(await gate.activeSupplierIds()).includes(seller.organization.id));
  current=buildSupplierLegalBundle(supplierLegalDocuments.map(item=>({...item,status:'PUBLISHED',version:'test-2',content:'New synthetic revision'})));
  assert.equal((await request('/supplier-terms/current',undefined,seller)).contractAccepted,false);
  assert.equal(await request(`/supplier-terms/acceptances/${receipt.id}/download`,undefined,seller),text);
  current=published;
  return {passed:true,authenticated:true,atomicEvidence:true,independentAdmission:true,tenantIsolation:true,immutableDownload:true};
}
async function stop() {
  if(stopping)return;stopping=true;
  for(const child of children)if(child.exitCode===null){child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(3000)]);}
  await app.close();
  await db.authSession.updateMany({where:{userId:{in:issued},status:'ACTIVE'},data:{status:'REVOKED',revokedAt:new Date(),revokeReason:'supplier_terms_test_cleanup'}});
  await db.$disconnect();
}
try {
  await app.listen(apiPort,'127.0.0.1');
  for(const [name,port] of [['supplier',3102],['admin',3100]]) {
    const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:path.join(root,`apps/${name}-web`),env:{...env,NODE_ENV:'production'},windowsHide:true,stdio:'ignore'});children.push(child);
    const deadline=Date.now()+60000;let ready=false;
    while(Date.now()<deadline&&child.exitCode===null){try{ready=(await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(1500)})).ok;if(ready)break;}catch{}await delay(300);}
    assert.ok(ready,`Owned ${name} readiness failed`);
  }
  process.on('message',async message=>{try{
    let value;
    if(message.type==='api-tests')value=await apiTests();
    else if(message.type==='documents'){current=message.draft?buildSupplierLegalBundle(supplierLegalDocuments):published;value={available:current.available};}
    else if(message.type==='setup'){
      const record=await account(message.key,message.operator?'MARKETPLACE_OPERATOR':'SUPPLIER');
      const session=message.operator?record.session:await request('/auth/handoff',{capability:'SUPPLIER'},record,201);
      value={organizationId:record.organization.id,name:record.organization.legalName,session};
    }
    else if(message.type==='accept'){value=await request('/supplier-terms/acceptances',acceptanceInput(),await account(message.key),201);}
    else if(message.type==='readback'){const record=accounts.get(message.key);value=await db.supplierTermsAcceptance.findMany({where:{organizationId:record.organization.id},select:{id:true,admissionStatus:true,bundleHash:true,representativeName:true}});}
    else throw Error('Unknown fixture action');
    process.send?.({id:message.id,value});
  }catch(error){process.send?.({id:message.id,error:error instanceof assert.AssertionError?error.message:`Fixture operation failed (${error.code??error.name}); details omitted`});}});
  process.once('disconnect',async()=>{await stop();process.exit(0);});
  process.send?.({type:'ready'});
} catch(error) {await stop();throw error;}
