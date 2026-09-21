// AUD-FIX-07.1: existing document API, real JWT; approved audit DB only.
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import {startLocalAuthFixture} from './lib/local-auth-fixture.mjs';
const fixture=await startLocalAuthFixture({web:true,operator:false,webApps:['buyer','supplier']});
const {db,runId}=fixture,accounts=new Map();
const pdf=await new Promise(resolve=>{const document=new PDFDocument(),chunks=[];document.on('data',chunk=>chunks.push(chunk));document.on('end',()=>resolve(Buffer.concat(chunks).toString('base64')));document.text('AUD07 SYNTHETIC TEST DOCUMENT - NOT LEGALLY SIGNED');document.end();});
async function prepare(){
 for(const [index,key,capability,upload] of [[1,'buyer','BUYER',true],[2,'supplier','SUPPLIER',true],[3,'restricted','BUYER',false]]){
  const account=await fixture.account(index,capability);const role=await db.role.findFirstOrThrow({where:{organizationId:account.organizationId}});
  for(const code of ['document.view',...(upload?['document.upload']:[])])await db.rolePermission.create({data:{roleId:role.id,permissionId:(await db.permission.findUniqueOrThrow({where:{code}})).id}});
  const session=await fixture.request('/auth/login',{email:account.email,password:account.password});accounts.set(key,{...account,capability,session});
 }
 return {runId};
}
async function setup(key){const account=accounts.get(key);assert.ok(account);const response=await fixture.request('/auth/handoff',{capability:account.capability},201,account.session.accessToken);return {runId,number:`AUD07-${runId}-${key}`,pdf,organizationId:account.organizationId,handoff:{capability:account.capability,organizationId:account.organizationId,handoffCode:response.handoffCode}};}
async function readback(key){const account=accounts.get(key);assert.ok(account);const documents=await db.document.findMany({where:{ownerOrganizationId:account.organizationId},select:{id:true,amountMinor:true,currency:true,documentNumber:true,title:true,checksumSha256:true,byteSize:true,status:true,accountingStatus:true,requiredSignatureCount:true}});
 return {organizationId:account.organizationId,documents:await Promise.all(documents.map(async d=>({...d,amountMinor:d.amountMinor?.toString(),audit:await db.auditLog.count({where:{entityId:d.id,action:'document.uploaded'}}),outbox:await db.outboxEvent.count({where:{aggregateId:d.id,eventType:'DocumentUploaded'}})})))};}
process.on('message',async message=>{try{let value;if(message.type==='prepare')value=await prepare();else if(message.type==='setup')value=await setup(message.key);else if(message.type==='readback')value=await readback(message.key);else throw Error('Unknown action');process.send?.({id:message.id,value});}catch(error){process.send?.({id:message.id,error:`Document fixture failed: ${error instanceof assert.AssertionError?error.message:'details omitted'}`});}});
process.once('disconnect',async()=>{await fixture.stop();process.exit(0);});
process.send?.({type:'ready'});
