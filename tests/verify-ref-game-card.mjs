import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require=createRequire(import.meta.url);
const refCard=require("../ref-game-card.js");
const refCardSource=fs.readFileSync(new URL("../ref-game-card.js",import.meta.url),"utf8");
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

class FakeElement{
  constructor(localName){this.localName=localName;this.attributes=new Map();this.children=[];this.parentNode=null;this.textContent="";}
  getAttribute(name){return this.attributes.get(name)??null;}
  hasAttribute(name){return this.attributes.has(name);}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  setAttributeNS(_namespace,name,value){this.setAttribute(name,value);}
  removeAttribute(name){this.attributes.delete(name);}
  appendChild(child){child.parentNode=this;this.children.push(child);return child;}
  insertBefore(child,before){child.parentNode=this;const index=before?this.children.indexOf(before):-1;if(index<0)this.children.push(child);else this.children.splice(index,0,child);return child;}
  remove(){if(!this.parentNode)return;const index=this.parentNode.children.indexOf(this);if(index>=0)this.parentNode.children.splice(index,1);this.parentNode=null;}
  getElementsByTagNameNS(_namespace,name){return this.children.flatMap(child=>[...(child.localName===name?[child]:[]),...child.getElementsByTagNameNS(_namespace,name)]);}
}
class FakeDocument{
  constructor(root){this.documentElement=root;}
  createElementNS(_namespace,qualifiedName){return new FakeElement(qualifiedName.split(":").pop());}
  getElementsByTagNameNS(namespace,name){return [...(this.documentElement.localName===name?[this.documentElement]:[]),...this.documentElement.getElementsByTagNameNS(namespace,name)];}
}
function fakeCell(address,style){const cell=new FakeElement("c");cell.setAttribute("r",address);if(style)cell.setAttribute("s",style);return cell;}
function fakeRow(number,cells=[]){const row=new FakeElement("row");row.setAttribute("r",number);cells.forEach(cell=>row.appendChild(cell));return row;}
const worksheet=new FakeElement("worksheet"),sheetData=new FakeElement("sheetData");worksheet.appendChild(sheetData);
sheetData.appendChild(fakeRow(30,[fakeCell("B30","4"),fakeCell("C30","4")]));
const missingRow=fakeRow(31,[fakeCell("D31","5")]);sheetData.appendChild(missingRow);
sheetData.appendChild(fakeRow(32,[fakeCell("B32","34"),fakeCell("C32","34")]));
const fakeDoc=new FakeDocument(worksheet);
refCard.__test.setCellText(fakeDoc,"B31","");
refCard.__test.setCellNumber(fakeDoc,"C31","");
assert.equal(refCard.__test.findCell(fakeDoc,"B31"),null,"an omitted cell that remains blank must stay untouched");
refCard.__test.setCellText(fakeDoc,"B31","Twenty-first Player");
refCard.__test.setCellNumber(fakeDoc,"C31",22);
assert.equal(refCard.__test.findCell(fakeDoc,"B31").getAttribute("s"),"4","a created name cell must inherit the nearest name-column style");
assert.equal(refCard.__test.findCell(fakeDoc,"C31").getAttribute("s"),"4","a created number cell must inherit the nearest number-column style");
assert.deepEqual(missingRow.children.map(cell=>cell.getAttribute("r")),["B31","C31","D31"],"created cells must be inserted in worksheet column order");
assert.equal(refCard.__test.findCell(fakeDoc,"B31").children[0].children[0].textContent,"Twenty-first Player");
assert.equal(refCard.__test.findCell(fakeDoc,"C31").children[0].textContent,"22");

assert.match(admin,/captain-portal-v56\.2-ref-game-card-print-layout/);
assert.match(admin,/LINEUP BUILDER V56\.2/);
assert.match(admin,/id="openRefGameCardBtn"/);
assert.match(admin,/id="downloadRefGameCardExcel"/);
assert.match(admin,/id="printRefGameCard"/);
assert.match(admin,/fullName:String\(r\.full_name/);
assert.match(admin,/getSelectedMatch:/);
assert.match(admin,/jszip@3\.10\.1/);
assert.match(admin,/ref-game-card\.js\?v=56\.2/);
assert.match(refCardSource,/function ensureCell\(doc,address\)/);
assert.match(refCardSource,/if\(!cell&&!clean\)return/);
assert.match(refCardSource,/if\(!cell&&blank\)return/);
assert.match(css,/@page\{size:Letter landscape;margin:\.25in\}/);
assert.match(css,/grid-template-rows:48px 158px minmax\(0,1fr\)/);
assert.match(css,/\.ref-card-field-value\{height:25px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;/);
assert.match(css,/\.ref-card-report-value\{height:25px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;/);
assert.match(css,/\.ref-card-roster\{[^}]*font-size:12\.5px\}/);
assert.match(handbook,/Current Captain Portal build: \*\*v56\.2\*\*/);

assert.ok(fs.existsSync(templatePath),"the sanitized Excel template must be present");
const sharedStrings=execFileSync("unzip",["-p",templatePath.pathname,"xl/sharedStrings.xml"],{encoding:"utf8"});
const rosterSheet=execFileSync("unzip",["-p",templatePath.pathname,"xl/worksheets/sheet2.xml"],{encoding:"utf8"});
const templateSheet=execFileSync("unzip",["-p",templatePath.pathname,"xl/worksheets/sheet1.xml"],{encoding:"utf8"});
for(const staleName of ["Todd Lamberg","Ivan Martinez","Press and Play","Dez Nizigama","Ayman Abunimer"]){
  assert.ok(!sharedStrings.includes(staleName),`sanitized template must not retain ${staleName}`);
  assert.ok(!rosterSheet.includes(staleName),`blank helper sheet must not retain ${staleName}`);
}
assert.match(templateSheet,/r="A36"[^>]*>[\s\S]*?<x:v>26<\/x:v>/,"the final handwriting row must be numbered 26");
assert.doesNotMatch(templateSheet,/r="B31"/,"fixture must retain the originally omitted blank cell that caused the production error");

console.log("Referee game-card verification passed.");
