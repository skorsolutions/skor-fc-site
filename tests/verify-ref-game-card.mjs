import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { inflateRawSync } from "node:zlib";

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
  cloneNode(deep){const copy=new FakeElement(this.localName);copy.attributes=new Map(this.attributes);copy.textContent=this.textContent;if(deep)this.children.forEach(c=>copy.appendChild(c.cloneNode(true)));return copy;}
}
class FakeDocument{
  constructor(root){this.documentElement=root;}
  createElementNS(_namespace,qualifiedName){return new FakeElement(qualifiedName.split(":").pop());}
  getElementsByTagNameNS(namespace,name){return [...(this.documentElement.localName===name?[this.documentElement]:[]),...this.documentElement.getElementsByTagNameNS(namespace,name)];}
}
function fakeCell(address,style){const cell=new FakeElement("c");cell.setAttribute("r",address);if(style)cell.setAttribute("s",style);return cell;}
function fakeRow(number,cells=[]){const row=new FakeElement("row");row.setAttribute("r",number);cells.forEach(cell=>row.appendChild(cell));return row;}
const worksheet=new FakeElement("worksheet"),sheetData=new FakeElement("sheetData");worksheet.appendChild(sheetData);
const columns=new FakeElement("cols");worksheet.appendChild(columns);
for(const [min,max,width] of [[1,1,"16.90625"],[2,2,"24.90625"],[3,3,"12.26953125"]]){
  const column=new FakeElement("col");column.setAttribute("min",min);column.setAttribute("max",max);column.setAttribute("width",width);columns.appendChild(column);
}
for(let row=3;row<=7;row++)sheetData.appendChild(fakeRow(row,[Object.assign(fakeCell(`A${row}`,"8"),{})]));
for(let row=11;row<=29;row++)sheetData.appendChild(fakeRow(row,[fakeCell(`A${row}`,row<17?"22":"31")]));
sheetData.appendChild(fakeRow(30,[fakeCell("B30","4"),fakeCell("C30","4")]));
const missingRow=fakeRow(31,[fakeCell("D31","5")]);sheetData.appendChild(missingRow);
sheetData.appendChild(fakeRow(32,[fakeCell("B32","34"),fakeCell("C32","34")]));
for(let row=33;row<=36;row++)sheetData.appendChild(fakeRow(row,[fakeCell(`A${row}`,"31")]));
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
refCard.__test.applyExcelRosterLayout(fakeDoc);
const fakeColumns=fakeDoc.getElementsByTagNameNS("","col");
assert.deepEqual(fakeColumns.map(column=>column.getAttribute("width")),["12.5","32.08203125","8.5"],"sequence and jersey columns must stay compact while labels and player names remain readable");
assert.equal(fakeDoc.getElementsByTagNameNS("","row").find(row=>row.getAttribute("r")==="11").getAttribute("ht"),"18.5","player rows must avoid text clipping without pushing the final signature off the page");
assert.equal(refCard.__test.findCell(fakeDoc,"A3").getAttribute("s"),"32","top labels must use the narrower-column label style");
assert.equal(refCard.__test.findCell(fakeDoc,"A11").getAttribute("s"),"52","top-border sequence cells must be centered");
assert.equal(refCard.__test.findCell(fakeDoc,"A33").getAttribute("s"),"47","regular sequence cells must be centered");
refCard.__test.applyPrintSettings(fakeDoc);
const setupPr=fakeDoc.getElementsByTagNameNS("","pageSetUpPr")[0];
const pageMargins=fakeDoc.getElementsByTagNameNS("","pageMargins")[0];
const pageSetup=fakeDoc.getElementsByTagNameNS("","pageSetup")[0];
assert.equal(setupPr.getAttribute("fitToPage"),"1","Excel must use fit-to-page mode");
assert.equal(setupPr.getAttribute("autoPageBreaks"),"0","automatic page breaks must not split the game card");
assert.equal(pageMargins.getAttribute("right"),"0.18","landscape margins must leave clearance at both horizontal edges");
assert.equal(pageMargins.getAttribute("bottom"),"0.18","landscape margins must leave clearance below Linesman 2");
assert.equal(pageSetup.getAttribute("fitToWidth"),"1","the game card must fit one page wide");
assert.equal(pageSetup.getAttribute("fitToHeight"),"1","the game card must fit one page tall");
assert.equal(pageSetup.getAttribute("scale"),null,"fixed scaling must not override fit-to-page settings");

const keeperState={...state,keeperPlan:{spareNumbers:[30,31],assignments:{p11:{role:'starting_temp',jerseyNumber:30},p2:{role:'secondary_temp',jerseyNumber:30}}}};
const keeperData=refCard.buildCardData({state:keeperState,roster,match});
assert.equal(refCard.validateCardData(keeperData).valid,true);
refCard.__test.applyExcelPlayers(fakeDoc,keeperData.players);
assert.equal(refCard.__test.findCell(fakeDoc,'C11').getAttribute('t'),'inlineStr','dual jerseys must be text in Excel');
assert.equal(refCard.__test.findCell(fakeDoc,'C11').children[0].children[0].textContent,'2 / 30');
assert.equal(refCard.__test.findCell(fakeDoc,'B11').children[0].children[0].textContent,'Ivan Martinez\n(secondary temp keeper)');
const stylesRoot=new FakeElement('styleSheet'),fonts=new FakeElement('fonts'),xfs=new FakeElement('cellXfs');
stylesRoot.appendChild(fonts);stylesRoot.appendChild(xfs);
const font=new FakeElement('font'),size=new FakeElement('sz');size.setAttribute('val','11');font.appendChild(size);fonts.appendChild(font);
for(let i=0;i<60;i++){const xf=new FakeElement('xf');xf.setAttribute('fontId','0');xfs.appendChild(xf);}
refCard.__test.applyKeeperExcelStyles(fakeDoc,new FakeDocument(stylesRoot),keeperData.players);
const keeperStyle=xfs.children[Number(refCard.__test.findCell(fakeDoc,'B11').getAttribute('s'))];
assert.equal(keeperStyle.getElementsByTagNameNS('','alignment')[0].getAttribute('wrapText'),'1');
assert.equal(fonts.children[Number(keeperStyle.getAttribute('fontId'))].children[0].getAttribute('val'),'8','keeper rows fit both name and duty inside the one-page card');

assert.match(admin,/captain-portal-v58\.21-substitution-alarm/);
assert.match(admin,/CAPTAIN PORTAL V57\.0/);
assert.match(admin,/id="openRefGameCardBtn"/);
assert.match(admin,/id="downloadRefGameCardExcel"/);
assert.match(admin,/id="printRefGameCard"/);
assert.match(admin,/fullName:String\(r\.full_name/);
assert.match(admin,/getSelectedMatch:/);
assert.match(admin,/jszip@3\.10\.1/);
assert.match(admin,/ref-game-card\.js\?v=58\.10/);
assert.match(refCardSource,/function ensureCell\(doc,address\)/);
assert.match(refCardSource,/if\(!cell&&!clean\)return/);
assert.match(refCardSource,/if\(!cell&&blank\)return/);
assert.match(css,/@page\{size:Letter landscape;margin:\.25in\}/);
assert.match(css,/grid-template-rows:48px 158px minmax\(0,1fr\)/);
assert.match(css,/\.ref-card-field-value\{height:25px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;/);
assert.match(css,/\.ref-card-report-value\{height:25px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;/);
assert.match(css,/\.ref-card-roster\{[^}]*font-size:12\.5px\}/);
assert.match(handbook,/Current Captain Portal build: \*\*v58\.21\*\*/);

assert.ok(fs.existsSync(templatePath),"the sanitized Excel template must be present");
const template=fs.readFileSync(templatePath);
function unzipEntry(name){
  for(let offset=0;offset<template.length-46;offset++){
    if(template.readUInt32LE(offset)!==0x02014b50)continue;
    const length=template.readUInt16LE(offset+28);
    if(template.subarray(offset+46,offset+46+length).toString()!==name)continue;
    const method=template.readUInt16LE(offset+10),size=template.readUInt32LE(offset+20),local=template.readUInt32LE(offset+42);
    const start=local+30+template.readUInt16LE(local+26)+template.readUInt16LE(local+28),bytes=template.subarray(start,start+size);
    assert.ok(method===0||method===8,'supported ZIP compression');
    return (method===8?inflateRawSync(bytes):bytes).toString('utf8');
  }
  throw new Error('Missing workbook entry: '+name);
}
const sharedStrings=unzipEntry('xl/sharedStrings.xml');
const rosterSheet=unzipEntry('xl/worksheets/sheet2.xml');
const templateSheet=unzipEntry('xl/worksheets/sheet1.xml');
for(const staleName of ["Todd Lamberg","Ivan Martinez","Press and Play","Dez Nizigama","Ayman Abunimer"]){
  assert.ok(!sharedStrings.includes(staleName),`sanitized template must not retain ${staleName}`);
  assert.ok(!rosterSheet.includes(staleName),`blank helper sheet must not retain ${staleName}`);
}
assert.match(templateSheet,/r="A36"[^>]*>[\s\S]*?<x:v>26<\/x:v>/,"the final handwriting row must be numbered 26");
assert.doesNotMatch(templateSheet,/r="B31"/,"fixture must retain the originally omitted blank cell that caused the production error");

console.log("Referee game-card verification passed.");

