import assert from 'node:assert/strict';
import {startLocalAuthFixture} from './lib/local-auth-fixture.mjs';
import {prepareDocumentRelations} from './lib/document-relations-fixture.mjs';
const fixture=await startLocalAuthFixture({web:true,operator:false,webApps:['buyer','supplier']});
let data;
process.on('message',async message=>{try {
  let value;
  if(message.type==='prepare'){data=await prepareDocumentRelations(fixture);value={runId:fixture.runId};}
  else if(message.type==='setup') {
    const account=data.accounts[message.key];assert.ok(['buyer','supplier'].includes(message.key));
    const handoff=await fixture.request('/auth/handoff',{capability:account.capability},201,account.session.accessToken);
    value={runId:fixture.runId,number:`AUD072-WEB-${message.key}-${fixture.runId}`,pdf:data.pdf,orderId:data.ownOrder.id,orderNumber:data.ownOrder.orderNumber,baseId:data.ownBase.id,baseNumber:data.ownBase.documentNumber,foreignOrderId:data.foreignOrder.id,foreignBaseId:data.foreignBase.id,handoff:{capability:account.capability,organizationId:account.organizationId,handoffCode:handoff.handoffCode}};
  } else if(message.type==='readback') {
    const account=data.accounts[message.key];assert.ok(account);
    const records=await fixture.db.document.findMany({where:{ownerOrganizationId:account.organizationId,documentNumber:{startsWith:'AUD072-WEB-'}},select:{id:true,supplierOrderId:true,baseAgreementDocumentId:true,documentNumber:true,status:true,participants:{select:{organizationId:true}}}});
    value=await Promise.all(records.map(async record=>({...record,audit:await fixture.db.auditLog.count({where:{entityId:record.id,action:'document.uploaded'}}),outbox:await fixture.db.outboxEvent.count({where:{aggregateId:record.id,eventType:'DocumentUploaded'}})})));
  } else throw Error('Unknown action');
  process.send?.({id:message.id,value});
}catch(error){process.send?.({id:message.id,error:error instanceof assert.AssertionError?error.message:'Relation fixture error; details omitted'});}});
process.once('disconnect',async()=>{await fixture.stop();process.exit(0);});process.send?.({type:'ready'});
