// AUD-FIX-06: genuine local JWT and checkout/confirmation; owned synthetic data only.
import assert from 'node:assert/strict';
import {startLocalAuthFixture} from './lib/local-auth-fixture.mjs';
const fixture=await startLocalAuthFixture({web:true,operator:false,webApps:['buyer','supplier'],publicCatalog:true});
const {db,runId,apiUrl}=fixture, cases=new Map();
let buyer,supplier,buyerSession,supplierSession,supplierOrganizationId,warehouse,reference;
async function grant(roleId,codes){for(const code of codes){const permission=await db.permission.findUniqueOrThrow({where:{code}});await db.rolePermission.create({data:{roleId,permissionId:permission.id}});}}
async function prepare(){
 const agreement=await db.marketplaceAgreement.findFirstOrThrow({where:{status:'ACTIVE',startsAt:{lte:new Date()},endsAt:{gt:new Date()}}});supplierOrganizationId=agreement.supplierOrganizationId;
 warehouse=await db.warehouse.findFirstOrThrow({where:{supplierOrganizationId}});
 reference=await db.supplierOffer.findFirstOrThrow({where:{supplierOrganizationId,saleUnitId:{not:null}}});
 supplier=await fixture.account(1,'SUPPLIER');const role=await db.role.findFirstOrThrow({where:{organizationId:supplier.organizationId}});
 await db.$transaction([db.role.update({where:{id:role.id},data:{organizationId:supplierOrganizationId,code:runId}}),db.organizationMembership.updateMany({where:{userId:supplier.userId,organizationId:supplier.organizationId},data:{organizationId:supplierOrganizationId}})]);
 await grant(role.id,['catalog.product.view','inventory.view','order.confirm','integration.view','compliance.view','inventory.freshness.manage','document.view','shipment.manage','delivery.view']);
 buyer=await fixture.account(2,'BUYER');const buyerRole=await db.role.findFirstOrThrow({where:{organizationId:buyer.organizationId}});
 await grant(buyerRole.id,['catalog.product.view','order.create','document.view','notification.view']);
 supplierSession=await fixture.request('/auth/login',{email:supplier.email,password:supplier.password});
 buyerSession=await fixture.request('/auth/login',{email:buyer.email,password:buyer.password});
 return {runId};
}
async function handoff(capability){const session=capability==='BUYER'?buyerSession:supplierSession;const response=await fixture.request('/auth/handoff',{capability},201,session.accessToken);return {capability,organizationId:capability==='BUYER'?buyer.organizationId:supplierOrganizationId,handoffCode:response.handoffCode};}
async function create(index){
 assert.ok(!cases.has(index)&&Number.isInteger(index)&&index>0&&index<10);
 const key=`${runId}-decision-${index}`,name=`AUD06 Материал ${index}`;
 const product=await db.product.create({data:{canonicalName:name,slug:key,baseUnitId:reference.saleUnitId,productType:'MATERIAL',status:'ACTIVE'}});
 const variant=await db.productVariant.create({data:{productId:product.id,sku:key,saleUnitId:reference.saleUnitId,packageQuantity:1,status:'ACTIVE'}});
 const packaging=await db.productPackaging.create({data:{productVariantId:variant.id,unitId:reference.saleUnitId,code:key,name:'Единица',level:'BASE',quantityInBaseUnit:1}});
 const offer=await db.supplierOffer.create({data:{supplierOrganizationId,productVariantId:variant.id,saleUnitId:reference.saleUnitId,packagingId:packaging.id,supplierSku:key,confirmationMode:'MANUAL',sourceType:'MANUAL',status:'ACTIVE'}});
 const entry={offerId:offer.id};cases.set(index,entry);
 await db.offerPublication.create({data:{offerId:offer.id,status:'PUBLISHED',marketplaceVisible:true,publishedAt:new Date()}});
 const price=index===1?'9007199254740993':'12501',freshnessExpiresAt=new Date(Date.now()+3600000);
 await db.offerPrice.create({data:{offerId:offer.id,amountMinor:price,currency:'KZT',status:'ACTIVE',validFrom:new Date(Date.now()-60000),lastConfirmedAt:new Date(),freshnessExpiresAt}});
 const balance=await db.inventoryBalance.create({data:{supplierOrganizationId,warehouseId:warehouse.id,productVariantId:variant.id,offerId:offer.id,quantityOnHand:10,quantityReserved:0,quantityAvailable:10,safetyStock:0,availabilityStatus:'IN_STOCK',freshnessStatus:'FRESH',source:'MANUAL',lastSuccessfulSyncAt:new Date(),freshnessExpiresAt}});
 await db.inventoryLot.create({data:{inventoryBalanceId:balance.id,supplierOrganizationId,warehouseId:warehouse.id,productVariantId:variant.id,offerId:offer.id,lotNumber:key,quantityOnHand:10,quantityReserved:0,quantityAvailable:10,status:'ACTIVE',expirationDate:new Date('2035-12-31')}});
 const cart=await fixture.request(`/buyers/${buyer.organizationId}/carts`,{currency:'KZT'},201,buyerSession.accessToken);
 await fixture.request(`/carts/${cart.id}/items`,{offerId:offer.id,quantity:4},201,buyerSession.accessToken);
 const carts=await fixture.request(`/buyers/${buyer.organizationId}/carts`,undefined,200,buyerSession.accessToken);
 const current=carts.find(candidate=>candidate.id===cart.id);assert.ok(current,'Created cart must be listed for its owner');
 const checkout=await fixture.request(`/carts/${cart.id}/checkout`,{idempotencyKey:key,expectedVersion:current.version},201,buyerSession.accessToken);
 const order=checkout.supplierOrders[0];assert.ok(order&&order.items.length===1);
 Object.assign(entry,{orderId:order.id,itemId:order.items[0].id,balanceId:balance.id,name,price,orderNumber:order.orderNumber});
 return {...entry,supplierHandoff:await handoff('SUPPLIER'),buyerHandoff:await handoff('BUYER')};
}
async function readback(index){
 const entry=cases.get(index);assert.ok(entry?.orderId);
 const order=await db.supplierOrder.findUniqueOrThrow({where:{id:entry.orderId},include:{items:true}});
 const balance=await db.inventoryBalance.findUniqueOrThrow({where:{id:entry.balanceId}});
 return {status:order.status,version:order.version,total:order.subtotalAmountMinor.toString(),items:order.items.map(i=>({quantity:i.quantity.toString(),accepted:i.acceptedQuantity.toString(),price:i.unitPriceMinor.toString(),total:i.totalPriceMinor.toString(),reason:i.decisionReason})),available:balance.quantityAvailable.toString(),reserved:balance.quantityReserved.toString(),audit:await db.auditLog.count({where:{entityId:order.id,action:'supplier_order.confirmed'}}),outbox:await db.outboxEvent.count({where:{aggregateId:order.id,eventType:'SupplierOrderConfirmed'}})};
}
process.on('message',async message=>{
 try{let value;
  if(message.type==='prepare')value=await prepare();
  else if(message.type==='create')value=await create(message.index);
  else if(message.type==='handoff')value=await handoff(message.capability);
  else if(message.type==='readback')value=await readback(message.index);
  else if(message.type==='confirm'){
   const entry=cases.get(message.index);assert.ok(entry?.orderId);
   const response=await fetch(`${apiUrl}/supplier-orders/${entry.orderId}/confirm`,{method:'POST',headers:{authorization:`Bearer ${supplierSession.accessToken}`,'content-type':'application/json'},body:JSON.stringify({decisions:[{itemId:entry.itemId,acceptedQuantity:message.quantity,...(message.quantity<4?{reason:message.reason}: {})}]})});
   value={status:response.status};
  }else throw Error('Unknown action');
  process.send?.({id:message.id,value});
 }catch(error){process.send?.({id:message.id,error:`Owned order fixture failed: ${error instanceof assert.AssertionError?error.message:'details omitted'}`});}
});
process.once('disconnect',async()=>{try{const ids=[...cases.values()].map(c=>c.offerId);await db.supplierOffer.updateMany({where:{id:{in:ids}},data:{status:'INACTIVE'}});await db.offerPublication.updateMany({where:{offerId:{in:ids}},data:{marketplaceVisible:false}});}finally{await fixture.stop();process.exit(0);}});
process.send?.({type:'ready'});
