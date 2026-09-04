export const STANDARD_SERVICE_FEE_BPS=1500;

export type CommercialProduct={key:string;audience:string;value:string;chargingBasis:string;doubleChargeGuardrail:string};
export const commercialProducts:CommercialProduct[]=[
 {key:'consumer_service_fee',audience:'customer',value:'Managed matching, booking, payment and recovery',chargingBasis:'Published percentage of underlying provider price',doubleChargeGuardrail:'Never deduct the same marketplace fee again from provider entitlement.'},
 {key:'corporate_management',audience:'business',value:'Portfolio controls, SLAs, consolidated reporting and billing',chargingBasis:'Explicit contracted management/monthly fee',doubleChargeGuardrail:'Must be separately disclosed and tied to corporate-only value.'},
 {key:'provider_finance',audience:'provider',value:'Ledger, invoicing, expenses, mileage and tax-ready records',chargingBasis:'Optional subscription/tier',doubleChargeGuardrail:'Must not be required merely to receive marketplace job entitlement.'},
 {key:'business_setup',audience:'provider',value:'Guided business launch preparation and operating pack',chargingBasis:'Optional setup/service fee',doubleChargeGuardrail:'External filing costs and professional advice must remain separately identified.'},
 {key:'education',audience:'institution/employer',value:'Placement matching, reporting and labour-demand intelligence',chargingBasis:'Optional institution/employer service',doubleChargeGuardrail:'Do not charge learners for mandatory access to safety or consent controls.'}
];

export function calculateCustomerFee(providerPricePence:number,bps=STANDARD_SERVICE_FEE_BPS){const fee=Math.round(providerPricePence*bps/10000);return{providerPricePence,serviceFeePence:fee,totalPence:providerPricePence+fee,providerReceivesPence:providerPricePence}}

export function effectivePlatformTake(totalPlatformRevenuePence:number,completedJobValuePence:number){return completedJobValuePence>0?totalPlatformRevenuePence/completedJobValuePence:0}

export function feeSensitivity(providerPricePence:number,stripePercent=.015,stripeFixedPence=20,bps=STANDARD_SERVICE_FEE_BPS){const q=calculateCustomerFee(providerPricePence,bps);const processing=Math.round(q.totalPence*stripePercent)+stripeFixedPence;return{...q,estimatedProcessingPence:processing,estimatedNetPlatformPence:q.serviceFeePence-processing}}
