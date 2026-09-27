import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require=createRequire(import.meta.url);
const refCard=require("../ref-game-card.js");
const admin=fs.readFileSync(new URL("../admin.html",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../ref-game-card.css",import.meta.url),"utf8");
const handbook=fs.readFileSync(new URL("../docs/PROJECT-HANDBOOK.md",import.meta.url),"utf8");
const templatePath=new URL("../assets/SKOR-Ref-Game-Card-Template.xlsx",import.meta.url);

const inlineScripts=[...admin.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
assert.ok(inlineScripts.length,"admin.html must contain inline scripts");
inlineScripts.forEach((match,index)=>new vm.Script(match[1],{filename:`admin.html#inline-${index+1}`}));

const roster=[
  {player_key:"p11",number:11,name:"Eddy",fullName:"Edward Levin",temp:false},
  {player_key:"p2",number:2,name:"Ivan",fullName:"Ivan Martinez",temp:false},
  {player_key:"pool",number:8,name:"Pool",fullName:"Pool Only Player",temp:false},
  {player_key:"temp:1",number:4,name:"Guest",fullName:"Temporary Guest Player",temp:true},
];
const state={formation:"4-2-3-1",slots:{GK:"p11",LB:"p2"},bench:["temp:1"],depth:{CAM:["pool"]}};
const match={id:"game-1",kickoff:"2026-10-03T23:30:00.000Z",home_team:"SKOR FC",away_team:"Press and Play",location:"Sweet Apple Park · Field 2"};
const data=refCard.buildCardData({state,roster,match});

assert.equal(refCard.CARD_CAPACITY,26);
assert.deepEqual(data.players.map(player=>player.name),["Ivan Martinez","Edward Levin","Temporary Guest Player"],"permanent players must sort by jersey and TEMP players must be appended");
assert.deepEqual(data.players.map(player=>player.number),[2,11,4]);
assert.ok(!data.players.some(player=>player.name==="Pool Only Player"),"Potential Positions alone must not place a player on the official card");
assert.equal(data.blankRows,23,"unused official rows must remain available for handwriting");
assert.equal(data.opponent,"Press and Play");
assert.equal(data.field,"Sweet Apple Park · Field 2");
assert.equal(data.dateLabel,"10/03/2026");
assert.equal(data.timeLabel,"7:30 PM");
assert.equal(refCard.validateCardData(data).valid,true);

const markup=refCard.buildCardMarkup(data);
assert.equal((markup.match(/class="ref-card-player-cell"/g)||[]).length,26,"the printable form must retain all 26 roster rows");
assert.match(markup,/Ivan Martinez/);
assert.match(markup,/Temporary Guest Player/);
assert.doesNotMatch(markup,/Pool Only Player/);

const noMatch=refCard.buildCardData({state,roster,match:null});
assert.equal(refCard.validateCardData(noMatch).valid,false);
assert.match(refCard.validateCardData(noMatch).errors.join(" "),/scheduled game/);
const duplicate=structuredClone(data);duplicate.players.push({id:"dup",name:"Duplicate Jersey",number:11,temp:true});
assert.match(refCard.validateCardData(duplicate).errors.join(" "),/Jersey #11/);
const missingNumber=structuredClone(data);missingNumber.players[2].number=null;
assert.match(refCard.validateCardData(missingNumber).errors.join(" "),/Assign a jersey number/);

assert.match(admin,/captain-portal-v56\.0-ref-game-card/);
assert.match(admin,/LINEUP BUILDER V56\.0/);
assert.match(admin,/id="openRefGameCardBtn"/);
assert.match(admin,/id="downloadRefGameCardExcel"/);
assert.match(admin,/id="printRefGameCard"/);
assert.match(admin,/fullName:String\(r\.full_name/);
assert.match(admin,/getSelectedMatch:/);
assert.match(admin,/jszip@3\.10\.1/);
assert.match(admin,/ref-game-card\.js\?v=56\.0/);
assert.match(css,/@page\{size:Letter landscape;margin:\.25in\}/);
assert.match(handbook,/Current Captain Portal build: \*\*v56\.0\*\*/);

assert.ok(fs.existsSync(templatePath),"the sanitized Excel template must be present");
const sharedStrings=execFileSync("unzip",["-p",templatePath.pathname,"xl/sharedStrings.xml"],{encoding:"utf8"});
const rosterSheet=execFileSync("unzip",["-p",templatePath.pathname,"xl/worksheets/sheet2.xml"],{encoding:"utf8"});
const templateSheet=execFileSync("unzip",["-p",templatePath.pathname,"xl/worksheets/sheet1.xml"],{encoding:"utf8"});
for(const staleName of ["Todd Lamberg","Ivan Martinez","Press and Play","Dez Nizigama","Ayman Abunimer"]){
  assert.ok(!sharedStrings.includes(staleName),`sanitized template must not retain ${staleName}`);
  assert.ok(!rosterSheet.includes(staleName),`blank helper sheet must not retain ${staleName}`);
}
assert.match(templateSheet,/r="A36"[^>]*>[\s\S]*?<x:v>26<\/x:v>/,"the final handwriting row must be numbered 26");

console.log("Referee game-card verification passed.");
