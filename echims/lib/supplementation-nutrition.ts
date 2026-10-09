export type NutritionBasis = {
  assessment_id: number; child_id: number; assessment_date: string;
  weight_for_age: string | null; height_for_age: string | null;
  weight_for_height: string | null; bmi_for_age: string | null;
  nutritional_status: string | null; evaluation_status: string | null;
  is_at_risk: boolean | null;
}
export function latestNutrition(rows: NutritionBasis[], childId: number, asOf: string) {
  return rows.filter(r => r.child_id === childId && r.assessment_date <= asOf)
    .sort((a,b) => b.assessment_date.localeCompare(a.assessment_date) || b.assessment_id-a.assessment_id)[0] ?? null
}
export function nutritionReview(r: NutritionBasis | null) {
  if (!r) return {rule:'MSP-N001',title:'No saved assessment',detail:'No assessment is available on or before this date. Record an assessment for nutrition-based recommendations. Routine eligibility is still checked separately.'}
  const codes=[r.weight_for_age,r.height_for_age,r.weight_for_height,r.bmi_for_age]
  // Saved acute screening takes priority, including edema-based screening.
  if (r.nutritional_status==='SAM' || r.nutritional_status==='INFANT_URGENT_REVIEW')
    return {rule:'MSP-N002',title:'Urgent clinical assessment',detail:'Review the saved acute screening result with the supervising PHN/RHM. Routine supplementation is not a treatment plan for this result.'}
  if (r.nutritional_status==='MAM') return {rule:'MSP-N003',title:'Clinical nutrition review',detail:'Review the saved MAM screening result and documented treatment plan before supplying commodities.'}
  if (r.evaluation_status!=='EVALUATED' || codes.some(c=>c==='NEEDS_VERIFICATION'))
    return {rule:'MSP-N004',title:'Assessment verification needed',detail:'Unavailable or unverified indicators must not be treated as normal or used to select treatment. Review the assessment first.'}
  if (codes.some(c=>['UNDERWEIGHT','SEVERELY_UNDERWEIGHT','STUNTED','SEVERELY_STUNTED','WASTED','SEVERELY_WASTED','WASTING','SEVERE_WASTING','THINNESS','SEVERE_THINNESS'].includes(c??'')))
    return {rule:'MSP-N005',title:'Nutrition follow-up',detail:'Review the saved classifications, feeding history and existing authorization with PHN/RHM. Classification does not choose a product or dose.'}
  if (codes.some(c=>['OVERWEIGHT','OBESE','OBESITY','POSSIBLE_RISK_OF_OVERWEIGHT'].includes(c??'')))
    return {rule:'MSP-N006',title:'Growth and feeding review',detail:'Review growth and feeding. Do not infer a micronutrient deficiency or prescribe supplements from weight classification.'}
  if (r.is_at_risk!==false || codes.some(c=>!c || ['NOT_EVALUATED','NOT_INTERPRETABLE_EDEMA','NOT_APPLICABLE','NEEDS_VERIFICATION'].includes(c)))
    return {rule:'MSP-N004',title:'Incomplete nutrition basis',detail:'Review available indicators and missing results. Do not default missing results to normal.'}
  return {rule:'MSP-N007',title:'Routine eligibility review',detail:'No risk is recorded in this assessment. Check age, previous administrations, external records, authorization and the applicable protocol.'}
}
