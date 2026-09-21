// AUD-FIX-05: owned synthetic offers only, in the explicitly approved audit DB.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startLocalAuthFixture } from './lib/local-auth-fixture.mjs';
const require=createRequire(import.meta.url);
const {SearchProjectionService}=require('../apps/api/dist/src/modules/search/search-projection.service.js');
const fixture=await startLocalAuthFixture({web:true,operator:false,webApps:['buyer','supplier'],publicCatalog:true});
const {db,runId,apiUrl}=fixture, offers=[], products=[];
const projection=new SearchProjectionService(db,{});
let prepared=false;
async function prepare(){
 assert.equal(prepared,false);prepared=true;
 const agreement=await db.marketplaceAgreement.findFirstOrThrow({where:{status:'ACTIVE',startsAt:{lte:new Date()},endsAt:{gt:new Date()}}});
 const supplierOrganizationId=agreement.supplierOrganizationId;
 const warehouse=await db.warehouse.findFirstOrThrow({where:{supplierOrganizationId}});
 const reference=await db.supplierOffer.findFirstOrThrow({where:{supplierOrganizationId,saleUnitId:{not:null}},include:{saleUnit:true}});
 const category=await db.category.findFirstOrThrow();
 const keyword=`auditcatalog${process.pid}`;
 for(let i=0;i<26;i++){
  const suffix=String(i).padStart(2,'0'), key=`${runId}-catalog-${suffix}`, quantity=i===0?'10':'1';
  const product=await db.product.create({data:{canonicalName:`${keyword} Материал ${suffix}`,slug:key,baseUnitId:reference.saleUnitId,productType:'MATERIAL',status:'ACTIVE',externalMetadata:{importedAsCanonicalDraft:true,auditRun:runId},categories:{create:{categoryId:category.id}}}});products.push(product.id);
  const variant=await db.productVariant.create({data:{productId:product.id,sku:key,saleUnitId:reference.saleUnitId,packageQuantity:quantity,status:'ACTIVE'}});
  const packaging=i===1?null:await db.productPackaging.create({data:{productVariantId:variant.id,unitId:reference.saleUnitId,code:key,name:i===0?'AUD05 Коробка 10':'AUD05 Штука',level:'BASE',quantityInBaseUnit:quantity}});
  const offer=await db.supplierOffer.create({data:{supplierOrganizationId,productVariantId:variant.id,saleUnitId:reference.saleUnitId,packagingId:packaging?.id,baseUnitsPerSaleUnit:quantity,supplierSku:key,confirmationMode:'MANUAL',sourceType:'MANUAL',status:'ACTIVE'}});offers.push(offer.id);
  await db.offerPublication.create({data:{offerId:offer.id,status:'PUBLISHED',marketplaceVisible:true,publishedAt:new Date()}});
  const freshnessExpiresAt=new Date(Date.now()+3600000);
  await db.offerPrice.create({data:{offerId:offer.id,amountMinor:i===0?'123450':'50000',currency:'KZT',status:'ACTIVE',validFrom:new Date(Date.now()-60000),lastConfirmedAt:new Date(),freshnessExpiresAt}});
  await db.inventoryBalance.create({data:{supplierOrganizationId,warehouseId:warehouse.id,productVariantId:variant.id,offerId:offer.id,quantityOnHand:10,quantityReserved:0,quantityAvailable:10,safetyStock:0,availabilityStatus:'IN_STOCK',freshnessStatus:'FRESH',source:'MANUAL',lastSuccessfulSyncAt:new Date(),freshnessExpiresAt}});
  await projection.rebuildProduct(product.id);
 }
 // Only newly-created audit membership/role is moved; existing supplier rights are not changed.
 const user=await fixture.account(1,'SUPPLIER');
 const role=await db.role.findFirstOrThrow({where:{organizationId:user.organizationId}});
 await db.$transaction([
  db.role.update({where:{id:role.id},data:{organizationId:supplierOrganizationId,code:runId}}),
  db.organizationMembership.updateMany({where:{userId:user.userId,organizationId:user.organizationId},data:{organizationId:supplierOrganizationId}}),
 ]);
 const permission=await db.permission.findUniqueOrThrow({where:{code:'catalog.product.view'}});
 await db.rolePermission.create({data:{roleId:role.id,permissionId:permission.id}});
 const session=await fixture.request('/auth/login',{email:user.email,password:user.password});
 const handoff=await fixture.request('/auth/handoff',{capability:'SUPPLIER'},201,session.accessToken);
 const buyer=await fixture.account(2,'BUYER');
 const buyerRole=await db.role.findFirstOrThrow({where:{organizationId:buyer.organizationId}});
 for(const code of ['order.create','document.view','notification.view','catalog.product.view']){
  const permission=await db.permission.findUniqueOrThrow({where:{code}});
  await db.rolePermission.create({data:{roleId:buyerRole.id,permissionId:permission.id}});
 }
 const buyerSession=await fixture.request('/auth/login',{email:buyer.email,password:buyer.password});
 const buyerHandoff=await fixture.request('/auth/handoff',{capability:'BUYER'},201,buyerSession.accessToken);
 const result=await fetch(`${apiUrl}/catalog/search?q=${keyword}&sort=NAME_ASC&limit=24`);
 assert.equal(result.status,200);const page=await result.json();assert.equal(page.total,26);assert.equal(page.items.length,24);
 return {keyword,categoryId:category.id,categoryName:category.nameRu,productId:products[0],offerId:offers[0],legacyProductName:`${keyword} Материал 01`,unit:reference.saleUnit.symbol,runId,
  handoff:{capability:'SUPPLIER',organizationId:supplierOrganizationId,handoffCode:handoff.handoffCode},
  buyerHandoff:{capability:'BUYER',organizationId:buyer.organizationId,handoffCode:buyerHandoff.handoffCode},publicPage:page};
}
process.on('message',async message=>{
 try {
  let value;
  if(message.type==='prepare')value=await prepare();
  else if(message.type==='readback')value={products:await db.product.count({where:{id:{in:products}}}),offers:await db.supplierOffer.count({where:{id:{in:offers}}}),prices:await db.offerPrice.findMany({where:{offerId:{in:offers}},select:{offerId:true,amountMinor:true}})};
  else throw Error('Unsupported action');
  process.send?.({id:message.id,value});
 }catch(error){process.send?.({id:message.id,error:`Owned catalog fixture failed: ${error instanceof assert.AssertionError ? error.message : 'details omitted'}`});}
});
process.once('disconnect',async()=>{
 try{await db.supplierOffer.updateMany({where:{id:{in:offers}},data:{status:'INACTIVE'}});await db.offerPublication.updateMany({where:{offerId:{in:offers}},data:{marketplaceVisible:false}});for(const id of products)await projection.rebuildProduct(id);}
 finally{await fixture.stop();process.exit(0);}
});
process.send?.({type:'ready'});
