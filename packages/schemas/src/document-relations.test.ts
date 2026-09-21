import {it,expect} from 'vitest';import {documentArchiveQuerySchema} from './core-api';
it('keeps existing bounded contract query and opaque ID validation',()=>{
 expect(documentArchiveQuerySchema.parse({category:'CONTRACT',q:' ДГ-12 ',limit:'100'})).toMatchObject({category:'CONTRACT',q:'ДГ-12',limit:100});
 for(const input of [{limit:101},{q:'x'.repeat(121)},{supplierOrderId:'not-an-id'}])expect(documentArchiveQuerySchema.safeParse(input).success).toBe(false);
});
