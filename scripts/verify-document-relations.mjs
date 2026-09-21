// AUD-FIX-07.2 diagnostic: actual JWT/API on explicitly approved audit DB only.
// Empty synthetic orders are reference fixtures, NOT checkout acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import {PrismaClient} from '@prisma/client';
import {startLocalAuthFixture} from './lib/local-auth-fixture.mjs';
const evidence=process.argv[2];
const evidenceRoot='C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-07/relations';
assert.equal(path.dirname(path.resolve(evidence)),path.resolve(evidenceRoot));
assert.ok(!fs.existsSync(evidence));
const fixture=await startLocalAuthFixture({web:false,operator:false});
const result={runId:fixture.runId,scope:'Mixed document/order tenant graph negative test; no checkout/payment/signature claim',cases:[]};
const accounts=[];
try {
  for(const [index,capability] of [[1,'BUYER'],[2,'SUPPLIER'],[3,'SUPPLIER']]){
    const account=await fixture.account(index,capability),role=await fixture.db.role.findFirstOrThrow({where:{organizationId:account.organizationId}});
    for(const code of ['document.view','document.upload'])await fixture.db.rolePermission.create({data:{roleId:role.id,permissionId:(await fixture.db.permission.findUniqueOrThrow({where:{code}})).id}});
    const session=await fixture.request('/auth/login',{email:account.email,password:account.password});accounts.push({...account,session});
  }
  const [buyer,supplier,foreign]=accounts;
  const cart=await fixture.db.cart.create({data:{buyerOrganizationId:buyer.organizationId}});
  const checkout=await fixture.db.checkout.create({data:{cartId:cart.id,buyerOrganizationId:buyer.organizationId,totalAmountMinor:'0',currency:'KZT',idempotencyKey:fixture.runId,pricingSnapshot:{syntheticReferenceFixture:true}}});
  const order=await fixture.db.supplierOrder.create({data:{checkoutId:checkout.id,buyerOrganizationId:buyer.organizationId,supplierOrganizationId:supplier.organizationId,orderNumber:`AUD072-${fixture.runId}`,subtotalAmountMinor:'0',currency:'KZT'}});
  const contentBase64=await new Promise(resolve=>{const pdf=new PDFDocument(),chunks=[];pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(Buffer.concat(chunks).toString('base64')));pdf.text('AUD072 SYNTHETIC REFERENCE FIXTURE - NOT LEGALLY SIGNED');pdf.end();});
  const base={format:'PDF',title:'Synthetic reference fixture',documentNumber:`AUD072-${fixture.runId}-base`,fileName:'reference.pdf',contentBase64,requiredSignatureCount:0};
  const contract=await fixture.request('/documents/upload',{...base,kind:'FRAMEWORK_SUPPLY_AGREEMENT',ownerOrganizationId:foreign.organizationId},201,foreign.session.accessToken);
  async function request(name,route,body){
    const response=await fetch(fixture.apiUrl+route,{method:body?'POST':'GET',headers:{authorization:`Bearer ${buyer.session.accessToken}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const payload=await response.json();const entry={name,status:response.status,denied:[400,403,404].includes(response.status)};
    if(response.ok&&payload.id)entry.createdDocumentId=payload.id;
    result.cases.push(entry);return entry;
  }
  await request('foreign contract direct read','/documents/archive/'+contract.id);
  const upload={...base,kind:'CONTRACT_ADDENDUM',ownerOrganizationId:buyer.organizationId,baseAgreementDocumentId:contract.id};
  await request('foreign base alone','/documents/upload',{...upload,documentNumber:base.documentNumber+'-alone'});
  const mixed=await request('own order plus foreign base','/documents/upload',{...upload,documentNumber:base.documentNumber+'-mixed',supplierOrderId:order.id});
  result.graph={buyerOrganizationId:buyer.organizationId,ownOrderId:order.id,foreignOrganizationId:foreign.organizationId,foreignContractId:contract.id};
  result.persisted=await fixture.db.document.findMany({where:{ownerOrganizationId:buyer.organizationId},select:{id:true,ownerOrganizationId:true,supplierOrderId:true,baseAgreementDocumentId:true,participants:{select:{organizationId:true,role:true}}}});
  result.status=result.cases.every(test=>test.denied)?'PASS':'FAIL';
  if(!mixed.denied)result.blocker='Owned order must not authorize a foreign base contract. No additional scenarios are executed.';
} finally {
  await fixture.stop();
  const db=new PrismaClient();try{result.cleanup={activeSessions:await db.authSession.count({where:{userId:{in:accounts.map(a=>a.userId)},status:'ACTIVE'}}),remainingMail:fs.readdirSync(path.join(fixture.runtime,'.tmp/auth-mail')).length,retained:'Owned synthetic records/files only; no automatic deletion/reseed'}}finally{await db.$disconnect();}
  fs.writeFileSync(evidence,JSON.stringify(result,null,2),{flag:'wx'});
}
console.log(JSON.stringify(result));if(result.status!=='PASS')process.exitCode=1;
