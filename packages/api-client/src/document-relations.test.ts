import {describe,it,expect,vi,afterEach} from 'vitest';
import {MarketplaceApiClient} from './index.js';
afterEach(()=>vi.unstubAllGlobals());
describe('existing related document query transport',()=>{
 it('uses scoped order endpoints and bounded contract server search without writes',async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>new Response('[]',{status:200,headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetcher);
  const api=new MarketplaceApiClient('http://localhost/api',{accessToken:'synthetic-token'});
  await api.listBuyerOrders('buyer');await api.listSupplierOrders();await api.listDocumentArchive({category:'CONTRACT',q:'ДГ 1&2',limit:100});
  expect(fetcher.mock.calls[0]?.[0]).toBe('http://localhost/api/buyers/buyer/orders');expect(fetcher.mock.calls[1]?.[0]).toBe('http://localhost/api/supplier-orders');
  const url=new URL(fetcher.mock.calls[2]?.[0]);expect(url.searchParams.get('q')).toBe('ДГ 1&2');expect(url.searchParams.get('category')).toBe('CONTRACT');expect(url.searchParams.get('limit')).toBe('100');
  expect(fetcher.mock.calls.every(([,options])=>!options.method||options.method==='GET')).toBe(true);
 });
});
