import type {Product, CartLine, SaleUnitMode} from '../types';
export interface SaleUnitDefinition {name: string; barcode: string; aliases: string[]; units: number; price: number;}
export function validFixedPack(pack: unknown): boolean;
export function saleUnitConfig(product: Product | null | undefined, mode: SaleUnitMode): SaleUnitDefinition | null;
export function resolveFixedPackBarcode(products: Product[], code: string):
  {product: Product; pack: NonNullable<Product['extra_packs']>[number]; mode: 'bundle' | 'set'; conflict?: never} |
  {conflict: true; product?: never; pack?: never; mode?: never} | null;
export function validateDemoSaleCart(cart: CartLine[], products: Product[]):
  {ok: true; subtotal: number; reason?: never} | {ok: false; reason: string; subtotal?: never};
