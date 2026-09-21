// Synthetic reference records only; not evidence of checkout, payment or signing.
import PDFDocument from 'pdfkit';
export async function prepareDocumentRelations(fixture) {
  const {db,runId}=fixture,accounts={};
  for(const [index,key,capability] of [[1,'buyer','BUYER'],[2,'supplier','SUPPLIER'],[3,'foreignBuyer','BUYER'],[4,'foreignSupplier','SUPPLIER']]) {
    const account=await fixture.account(index,capability);
    await db.organization.update({where:{id:account.organizationId},data:{displayName:`AUD072 ${key}`,legalName:`Synthetic ${key} ${runId}`}});
    const role=await db.role.findFirstOrThrow({where:{organizationId:account.organizationId}});
    for(const code of ['document.view','document.upload','document.manage',capability==='BUYER'?'order.create':'order.confirm']) await db.rolePermission.create({data:{roleId:role.id,permissionId:(await db.permission.findUniqueOrThrow({where:{code}})).id}});
    const session=await fixture.request('/auth/login',{email:account.email,password:account.password});
    accounts[key]={...account,capability,session,roleId:role.id};
  }
  async function order(buyer,supplier,key) {
    const cart=await db.cart.create({data:{buyerOrganizationId:buyer.organizationId}});
    const checkout=await db.checkout.create({data:{cartId:cart.id,buyerOrganizationId:buyer.organizationId,totalAmountMinor:'0',currency:'KZT',idempotencyKey:runId+key,pricingSnapshot:{syntheticReferenceFixture:true}}});
    return db.supplierOrder.create({data:{checkoutId:checkout.id,buyerOrganizationId:buyer.organizationId,supplierOrganizationId:supplier.organizationId,orderNumber:`AUD072-${key}-${runId}`,subtotalAmountMinor:'0',currency:'KZT'}});
  }
  const ownOrder=await order(accounts.buyer,accounts.supplier,'OWN'),foreignOrder=await order(accounts.foreignBuyer,accounts.foreignSupplier,'FOREIGN');
  const pdf=await new Promise(resolve=>{const doc=new PDFDocument(),chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks).toString('base64')));doc.text('AUD072 SYNTHETIC REFERENCE - NOT LEGALLY SIGNED');doc.end();});
  const upload={format:'PDF',title:'Тестовое дополнение',fileName:'reference.pdf',contentBase64:pdf,requiredSignatureCount:0};
  const ownBase=await fixture.request('/documents/upload',{...upload,title:'Рамочный договор поставки (тест)',kind:'FRAMEWORK_SUPPLY_AGREEMENT',ownerOrganizationId:accounts.supplier.organizationId,supplierOrderId:ownOrder.id,documentNumber:`AUD072-BASE-${runId}`},201,accounts.supplier.session.accessToken);
  const foreignBase=await fixture.request('/documents/upload',{...upload,kind:'FRAMEWORK_SUPPLY_AGREEMENT',ownerOrganizationId:accounts.foreignSupplier.organizationId,documentNumber:`AUD072-FOREIGN-BASE-${runId}`},201,accounts.foreignSupplier.session.accessToken);
  const template=await db.documentTemplate.create({data:{code:runId,version:1,kind:'CONTRACT_ADDENDUM',name:'Synthetic reference template',templateBody:'AUD072 synthetic {{note}}',effectiveFrom:new Date('2020-01-01')}});
  return {accounts,ownOrder,foreignOrder,ownBase,foreignBase,template,upload,pdf};
}
