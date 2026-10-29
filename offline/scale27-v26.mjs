// V26 isolated local-PC scale label parser. 27 + PLU(5) + grams(5) + EAN13 check.
export function decodeScale27(raw){
 const code=String(raw||"").trim();
 if(!/^27[0-9]{11}$/.test(code))return null;
 let sum=0;
 for(let i=0;i<12;i++)sum+=(code.charCodeAt(i)-48)*(i%2===0?1:3);
 const expected=(10-sum%10)%10;
 const plu=code.slice(2,7),grams=Number(code.slice(7,12));
 if(Number(code[12])!==expected||plu==="00000"||grams<1||grams>99999)return null;
 return {code,plu,grams,kg:(grams/1000).toFixed(3)};
}
