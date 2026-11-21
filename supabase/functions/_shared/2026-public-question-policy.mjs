// Stage 28 (B-01): one conservative allowlist for public 2026 survey data.
// Q31 is sensitive school/teacher harm information; Q51 and all other unknown
// IDs, suffixed fields, free-answer keys and respondent metadata are private.
// Only approved exact-snapshot server paths may call this; an allowed ID alone
// does NOT constitute publication approval.
const questionId=/^Q(0[1-9]|[1-4][0-9]|50)$/;
export const isPublic2026QuestionId=id=>
  typeof id==='string'&&questionId.test(id)&&id!=='Q31';
export const isPublic2026MetricKey=id=>
  id==='percentile'||isPublic2026QuestionId(id);
