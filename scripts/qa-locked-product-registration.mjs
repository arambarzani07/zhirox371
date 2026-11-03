import assert from 'node:assert/strict';
import {
  validateLockedProduct, productCodes, parseAliases, MAX_ALIAS_BARCODES
} from '../src/utils/lockedProductRules.ts';

// Node 22.23 strips TypeScript types from the ACTUAL application validator.
// Do not import the TypeScript 7 compiler API (ModuleKind is no longer exported).
const valid = {
  id: 'one', name: 'چای', base_unit: 'unit', sale_mode: 'both',
  unit_barcode: '001234567890', unit_alias_barcodes: ['000001'],
  unit_purchase_price_iqd: 200, unit_sale_price_iqd: 250,
  carton: { name: 'کارتۆن', barcode: '0001234', alias_barcodes: ['0001235'],
    units_per_carton: 24, purchase_price_iqd: 3500, sale_price_iqd: 5500 },
  packages: [
    { id: 'pack-6', kind: 'pack', name: 'دەستە 6', barcode: '0000006',
      alias_barcodes: ['0000007'], units_per_package: 6,
      purchase_price_iqd: 1200, sale_price_iqd: 1400 },
    { id: 'set-3', kind: 'set', name: 'سێت 3', barcode: '0000003',
      alias_barcodes: [], units_per_package: 3,
      purchase_price_iqd: null, sale_price_iqd: 680 }
  ],
  stock: 240, min_stock: 5, category: 'خۆراک', sku: null, plu: null
};
const check = (v, existing = [], editing = null) => validateLockedProduct(v, existing, editing);
assert.equal(check(valid), null, 'complete unit/carton/pack/set draft must validate');
assert.equal(productCodes(valid).length, 7, 'every primary and alias code counted');
assert.equal(parseAliases(' 0001, 0002\n0003 ').join(','), '0001,0002,0003');
assert.match(check({ ...valid, unit_alias_barcodes: ['0001234'] }), /دووبارە/);
assert.match(check({ ...valid, packages: [{...valid.packages[0], barcode: '0001235'}] }), /دووبارە/);
assert.match(check(valid, [{ ...valid, id: 'another' }]), /پێشتر/);
assert.equal(check(valid, [{ ...valid, id: 'one' }], 'one'), null, 'editing preserves same-product codes');
assert.match(check({ ...valid, packages: [{...valid.packages[0], units_per_package: 1}] }), /نادروست/);
assert.match(check({ ...valid, packages: [{...valid.packages[0], sale_price_iqd: 0}] }), /نادروست/);
assert.match(check({ ...valid, packages: [{...valid.packages[0], purchase_price_iqd: -1}] }), /نادروست/);
assert.match(check({ ...valid, unit_sale_price_iqd: 12.5 }), /نادروست/);
assert.match(check({ ...valid, unit_alias_barcodes: Array.from({length: MAX_ALIAS_BARCODES+1}, (_,i) => String(i)) }), /30/);
assert.match(check({ ...valid, stock: -1 }), /کۆگا/);
assert.match(check({ ...valid, stock: 3.2 }), /کۆگا/);
assert.match(check({ ...valid, base_unit: 'kg', stock: 2.1234 }), /کۆگا/);
assert.equal(check({ ...valid, base_unit: 'kg', stock: 2.125 }), null);
assert.match(check({ ...valid, min_stock: NaN }), /کۆگا/);
console.log('PASS locked catalog validation: 17 assertions + exact barcode, package and cost semantics');
