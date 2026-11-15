import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const c=vm.createContext({crypto:webcrypto});vm.runInContext(fs.readFileSync('post-match-entry.js','utf8'),c);
const a=c.SKORPostMatch,plain=x=>JSON.parse(JSON.stringify(x));
const people=[{player_key:'p1',name:'First',number:7},{player_key:'p2',name:'Second',number:12},{player_key:'temp:fixture',name:'Guest',number:null,is_temp:true}];
const original={match:{id:'fixture',status:'final'},revision:'fixture-revision',participants:people,events:[
  {id:'goal-a',event_type:'skor_goal',half:'first',roster_player_key:'p1',assist_roster_player_key:'p2',clock_elapsed_seconds:1234,clock_period:'first_half',player_number:'30'},
  {id:'goal-b',event_type:'skor_goal',half:'first',roster_player_key:'p2',assist_status:'none',clock_elapsed_seconds:1300,clock_period:'first_half'}]};
const before=JSON.stringify(original),d=a.createDraft(original);
a.setGoalCount(d,'first',3);const pending=d.rows.find(r=>!d.base.has(r.id));assert.equal(pending.player_key,null,'adding a goal never guesses its scorer');
assert.equal(a.missingScorers(d).length,1);assert.throws(()=>a.submission(d),/Choose a scorer/);
a.setScorer(d,pending.id,'temp:fixture');a.setAssist(d,pending.id,'p1');
let body=a.submission(d);assert.equal(body.p_upserts.length,1);assert.equal(body.p_upserts[0].id,pending.id);assert.equal(body.p_upserts[0].player_key,'temp:fixture');assert.equal(body.p_upserts[0].assist_key,'p1');
a.setGoalCount(d,'first',2);assert.equal(a.changes(d).upserts.length,0,'decrement removes a new goal before original records');
a.setGoalCount(d,'first',3);assert.equal(d.rows.find(r=>r.id===pending.id).player_key,'temp:fixture','undoing a decrement restores the edited draft and its stable ID');
a.setGoalCount(d,'first',2);a.setGoalCount(d,'first',1);a.setGoalCount(d,'first',2);assert.equal(a.changes(d).deleted.length,0);assert.equal(a.changes(d).upserts.length,0,'minus then plus preserves original goal IDs and timestamps');
assert.throws(()=>a.setScorer(d,'goal-a','p2'),/scorer cannot also be the assister/);assert.equal(d.rows.find(r=>r.id==='goal-a').player_key,'p1');
a.setAssist(d,'goal-a','none');a.setScorer(d,'goal-a','p2');body=a.submission(d);assert.equal(body.p_upserts[0].id,'goal-a','corrections update the same goal');assert.equal(body.p_upserts[0].assist_status,'none');assert.equal(body.p_upserts[0].clock_elapsed_seconds,undefined,'existing timestamps remain server-owned');
assert.throws(()=>a.setAssist(d,'goal-a','p2'));assert.throws(()=>a.setScorer(d,'goal-a','another-game-player'));
a.removeGoal(d,'goal-b');assert.deepEqual(plain(a.changes(d).deleted),['goal-b']);a.setGoalCount(d,'first',2);assert.equal(a.changes(d).deleted.length,0);
a.setGoalCount(d,'extra_second',1);const ot=d.rows.find(r=>r.half==='extra_second');a.setScorer(d,ot.id,'p1');a.setAssist(d,ot.id,'unknown');assert.equal(a.totals(d,'extra_second').skor,1);
assert.equal(JSON.stringify(original),before,'draft editing does not mutate the original event snapshot');
const history=a.createDraft({...original,events:[{id:'manual',half:'first',event_type:'skor_goal',player_name:'Historical name'}]});
assert.equal(a.goalCounts(history,'first').total,1);assert.throws(()=>a.setGoalCount(history,'first',0));a.setGoalCount(history,'first',2);const linked=history.rows[0];a.setScorer(history,linked.id,'p1');assert.equal(a.submission(history).p_upserts.length,1);assert.equal(a.submission(history).p_delete_ids.length,0,'unlinked historical goals are protected');
const script=fs.readFileSync('post-match-entry.js','utf8');assert(script.includes('SKOR goals'));assert(script.includes('>Scorer<select'));assert(script.includes('>Assister<select'));assert(!script.includes('Add player<select'));assert(script.includes('Add card for<select'));
console.log('Goal-first entry: explicit scorer/assister for each goal, incomplete-save guard, stable draft/original IDs, safe undo/removal/correction, scoped guest identities, overtime and protected historical goals pass.');
