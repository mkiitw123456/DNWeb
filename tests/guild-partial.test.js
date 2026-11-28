import test from "node:test";
import assert from "node:assert/strict";
import {applyCharacterPatch, applySeatPatch} from "../src/guildPatches.js";

test("a seat receipt updates just that seat, ignores older replies and preserves other guild data", () => {
  const other = {characterId:"b"};
  const raid = {id:"r",revision:2,slots:[null,other]};
  const untouched = {id:"other",revision:1,slots:[]};
  const state = {raids:[raid,untouched],characters:[]};
  const patch = {id:"r",index:0,slot:{characterId:"a"},revision:3,notification:"unsent",updatedAt:42};
  const next = applySeatPatch(state,patch);
  assert.deepEqual(next.raids[0],{...raid,revision:3,notification:"unsent",updatedAt:42,slots:[patch.slot,other]});
  assert.equal(next.raids[1],untouched);
  assert.equal(next.characters,state.characters);
  assert.equal(applySeatPatch(next,{...patch,revision:2,slot:null}).raids[0],next.raids[0]);
});

test("character reassignment removes the old owner's card and marks the previously booked seat unavailable", () => {
  const state = {me:{id:"a"},characters:[{id:"c",ownerId:"a"}],roster:[{id:"c"}],
    raids:[{slots:[{characterId:"c",ownerId:"a"},null]}]};
  const c = {id:"c",name:"New",ownerId:"b",professionId:"p",week:3,runs:{},gear:{},note:"personal"};
  const next = applyCharacterPatch(state,c);
  assert.deepEqual(next.characters,[]);
  assert.equal(next.raids[0].slots[0].unavailable,true);
  assert.equal(next.roster[0].ownerId,"b");
  assert.equal("note" in next.roster[0],false);
});
