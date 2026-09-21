// AUD-FIX-07.2: real JWT + PostgreSQL regression; explicit approved audit DB only.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {PrismaClient} from '@prisma/client';
import {startLocalAuthFixture} from './lib/local-auth-fixture.mjs';
import {prepareDocumentRelations} from './lib/document-relations-fixture.mjs';
const evidence=process.argv[2],evidenceRoot='C:/Users/user/Desktop/dentmarket-ui-ux-audit-screens/remediation/AUD-FIX-07/relations';
assert.equal(path.dirname(path.resolve(evidence)),path.resolve(evidenceRoot));assert.ok(!fs.existsSync(evidence));
const fixture=await startLocalAuthFixture({web:false,operator:false}),{db}=fixture;
const result={runId:fixture.runId,scope:'Reference graph only; synthetic empty orders; no payment/signature/checkout acceptance',cases:[]};
try {
  const {accounts,ownOrder,foreignOrder,ownBase,foreignBase,template,upload}=await prepareDocumentRelations(fixture);
  async function counts(){const orgIds=Object.values(accounts).map(a=>a.organizationId);return {
    documents:await db.document.count({where:{ownerOrganizationId:{in:orgIds}}}),
    audit:await db.auditLog.count({where:{organizationId:{in:orgIds}}}),
    outbox:await db.outboxEvent.count({where:{aggregateType:'Document',aggregateId:{in:(await db.document.findMany({where:{ownerOrganizationId:{in:orgIds}},select:{id:true}})).map(d=>d.id)}}}),
  };}
  async function check(name,actor,route,body,expected) {
    const before=await counts();
    const response=await fetch(fixture.apiUrl+route,{method:body?'POST':'GET',headers:{authorization:`Bearer ${actor.session.accessToken}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const payload=await response.json(),entry={name,status:response.status,expected};result.cases.push(entry);
    assert.equal(response.status,expected,name);
    if(expected>=400){assert.deepEqual(await counts(),before,'No document/audit/outbox writes on rejection');entry.noWrite=true;}
    else {
      const stored=await db.document.findUniqueOrThrow({where:{id:payload.id},include:{participants:true}});
      assert.equal(stored.baseAgreementDocumentId,ownBase.id);
      assert.ok(stored.participants.every(p=>[accounts.buyer.organizationId,accounts.supplier.organizationId].includes(p.organizationId)));
      assert.ok(stored.storageKey);assert.equal(stored.status,'GENERATED');entry.persisted={id:stored.id,orderId:stored.supplierOrderId,baseId:stored.baseAgreementDocumentId};
    }
    entry.result='PASS';return payload;
  }
  await check('foreign archive remains hidden',accounts.buyer,'/documents/archive/'+foreignBase.id,undefined,404);
  for(const key of ['buyer','supplier'])for(const method of ['upload','generate']) {
    const actor=accounts[key],common=method==='upload'?{...upload,kind:'CONTRACT_ADDENDUM'}:{templateId:template.id,title:'Synthetic addendum',data:{note:'test'}};
    const body={...common,ownerOrganizationId:actor.organizationId};
    for(const [label,order,base,expected] of [['own-order/foreign-base',ownOrder,foreignBase,400],['foreign-order/own-base',foreignOrder,ownBase,400],['foreign-base-alone',null,foreignBase,400],['own-order/own-base',ownOrder,ownBase,201],['own-base-alone',null,ownBase,201]]) {
      await check(`${key}/${method}/${label}`,actor,'/documents/'+method,{...body,documentNumber:`${fixture.runId}-${result.cases.length}`,supplierOrderId:order?.id,baseAgreementDocumentId:base.id},expected);
    }
  }
  // Historical draft remains valid; no publication/signature rules changed.
  await db.document.update({where:{id:ownBase.id},data:{status:'DRAFT'}});
  const valid=await check('draft base remains linkable',accounts.buyer,'/documents/generate',{templateId:template.id,ownerOrganizationId:accounts.buyer.organizationId,documentNumber:`${fixture.runId}-draft`,title:'Synthetic draft reference',data:{},baseAgreementDocumentId:ownBase.id},201);
  await check('legitimate new version',accounts.buyer,`/documents/${valid.id}/versions`,{data:{note:'revision'},reason:'Synthetic revision'},201);
  // Deliberately invalid pre-fix record is fixture setup, not a business workaround.
  const legacy=await db.document.create({data:{ownerOrganizationId:accounts.buyer.organizationId,templateId:template.id,kind:'CONTRACT_ADDENDUM',category:'CONTRACT',format:'PDF',source:'GENERATED',status:'GENERATED',title:'Synthetic invalid legacy',documentNumber:`${fixture.runId}-legacy`,supplierOrderId:ownOrder.id,baseAgreementDocumentId:foreignBase.id}});
  await check('legacy mixed graph cannot be copied',accounts.buyer,`/documents/${legacy.id}/versions`,{data:{},reason:'Synthetic denied revision'},400);
  result.status='PASS';
} catch(error){result.status='FAIL';result.error=error instanceof assert.AssertionError?error.message:'Fixture/runtime failure; details omitted';throw error;}
finally {
  await fixture.stop();const checkDb=new PrismaClient();
  try{result.cleanup={activeSessions:await checkDb.authSession.count({where:{user:{email:{startsWith:fixture.runId}},status:'ACTIVE'}}),remainingMail:fs.readdirSync(path.join(fixture.runtime,'.tmp/auth-mail')).length,retained:'Synthetic records/files retained; owned sessions revoked, mail removed; no demo reseed'}}finally{await checkDb.$disconnect();}
  fs.writeFileSync(evidence,JSON.stringify(result,null,2),{flag:'wx'});
}
console.log(JSON.stringify(result));
