export type Money={currency:string;amountPence:number};
export type JournalDirection='debit'|'credit';
export type JournalLine={accountCode:string;direction:JournalDirection;amountPence:number;jobId?:string|null;organisationId?:string|null;providerId?:string|null;metadata?:Record<string,unknown>};
export type JournalDraft={idempotencyKey:string;sourceType:string;sourceId:string;currency:string;lines:JournalLine[];metadata?:Record<string,unknown>};
export type MarketplaceEconomics={providerPricePence:number;platformFeePence:number;processingFeePence:number;refundPence:number;netPlatformMarginPence:number};

export function assertBalancedJournal(lines:JournalLine[]){const debit=lines.filter(x=>x.direction==='debit').reduce((s,x)=>s+x.amountPence,0);const credit=lines.filter(x=>x.direction==='credit').reduce((s,x)=>s+x.amountPence,0);if(lines.length<2||debit<=0||debit!==credit)throw new Error('journal_not_balanced');return{debitPence:debit,creditPence:credit}}
export function marketplaceEconomics(providerPricePence:number,platformFeePence:number,processingFeePence=0,refundPence=0):MarketplaceEconomics{return{providerPricePence,platformFeePence,processingFeePence,refundPence,netPlatformMarginPence:platformFeePence-processingFeePence-refundPence}}
export function reverseJournal(original:JournalDraft,reason:string):JournalDraft{return{idempotencyKey:`reversal:${original.idempotencyKey}`,sourceType:`${original.sourceType}_reversal`,sourceId:original.sourceId,currency:original.currency,lines:original.lines.map(line=>({...line,direction:line.direction==='debit'?'credit':'debit'})),metadata:{...(original.metadata||{}),reversalReason:reason,reverses:original.idempotencyKey}}}
export function accountingPeriod(date:Date,period:'month'|'quarter'|'year'){const year=date.getUTCFullYear();const month=date.getUTCMonth()+1;if(period==='month')return`${year}-${String(month).padStart(2,'0')}`;if(period==='quarter')return`${year}-Q${Math.ceil(month/3)}`;return String(year)}
