import {DomainError} from './errors';
export const VERDICT_POLICY={
 weights:{safetyScore:0.25,qualityScore:0.25,reviewsScore:0.2,priceScore:0.15,longTermScore:0.15},
 roundingDecimals:1,
 overallScoreTolerance:0.11,
 thresholds:[{type:'WORTH_IT',minInclusive:7.5},{type:'WORTH_IT_WITH',minInclusive:6},{type:'WAIT',minInclusive:4.5},{type:'NOT_WORTH_IT',minInclusive:0}],
 guidance:'Calculate the weighted component scores, round to one decimal, then select the matching threshold. Do not alter evidence-based component scores to force a verdict label.',
} as const;
type Assessment={safetyScore:number;qualityScore:number;reviewsScore:number;priceScore:number;longTermScore:number;overallScore:number;type:string};
export function validateVerdict(value:Assessment):{score:number;type:string}{
 const w=VERDICT_POLICY.weights;
 const score=Math.round((value.safetyScore*w.safetyScore+value.qualityScore*w.qualityScore+value.reviewsScore*w.reviewsScore+value.priceScore*w.priceScore+value.longTermScore*w.longTermScore)*10)/10;
 const type=VERDICT_POLICY.thresholds.find(t=>score>=t.minInclusive)!.type;
 if(Math.abs(score-value.overallScore)>VERDICT_POLICY.overallScoreTolerance||value.type!==type)throw new DomainError('INVALID_INPUT',`Calculated verdict is ${score.toFixed(1)} / 10, requiring ${type}. Thresholds: WORTH_IT >= 7.5; WORTH_IT_WITH >= 6 and < 7.5; WAIT >= 4.5 and < 6; NOT_WORTH_IT < 4.5. Weights: safety 25%, quality 25%, reviews 20%, price 15%, longTerm 15%. Keep evidence-based component scores; do not change them to force a label.`);
 return {score,type};
}
