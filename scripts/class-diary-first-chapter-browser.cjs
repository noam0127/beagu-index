/* Shared browser flow: public school facts -> colleague prologue -> protagonist setup -> first-person Chapter 1. */
'use strict';
const assert=require('node:assert/strict');
async function startFirstChapter(page,narratorName,heroName='새봄'){
 const school=page.locator('#diaryPrologueSchool');
 await school.waitFor({state:'visible',timeout:15000});
 const schoolTitle=(await page.locator('#diaryPrologueSchoolTitle').innerText()).trim();
 assert(schoolTitle.length>=2,'School briefing must show selected school name');
 const details=await page.locator('#diaryPrologueSchoolFacts').innerText();
 assert(details.includes('학교명'),'School briefing must identify source-backed public facts');
 assert((await page.locator('#diaryPrologueSchoolSource').innerText()).includes('허구'),
  'School statistics must be clearly separated from fictional 2027 events');
 await page.locator('#diaryPrologueSchoolContinue').click();
 await school.waitFor({state:'hidden'});
 const chapter=page.locator('#chapterDay');
 const first=await chapter.innerText();
 assert(first.includes('프롤로그')&&first.includes(narratorName),
  'Chosen colleague must narrate prologue, got '+first);
 let turns=0;
 while(await page.locator('#playerSetup').isHidden()&&turns++<300){
  if(await page.locator('#vnMore').isVisible())await page.locator('#vnMore').click();
  else if(await page.locator('#nextBtn').isVisible())await page.locator('#nextBtn').click();
  else throw Error('Prologue blocked before protagonist setup at turn '+turns);
 }
 assert(turns<300,'Prologue did not complete');
 await page.locator('#playerSetup').waitFor({state:'visible'});
 assert((await page.locator('#playerSetup').innerText()).includes('기간제'),
  'The protagonist is a substitute fixed-term teacher');
 await page.locator('#heroName').fill(heroName);
 await page.locator('#heroExperience').selectOption('mid');
 await page.locator('#heroGender').selectOption('undisclosed');
 await page.locator('#playerSetupForm button[type="submit"]').click();
 await page.locator('#novel').waitFor({state:'visible'});
 const next=await chapter.innerText();
 assert(next.startsWith('1 / 36')&&next.includes('나의 시점'),
  'Chapter 1 must switch to the named player, got '+next);
 return {schoolTitle,turns};
}
module.exports={startFirstChapter};
