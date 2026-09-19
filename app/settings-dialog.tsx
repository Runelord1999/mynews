'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle} from '@/components/ui/dialog';
import {Save,ListFilter,Globe,ShieldCheck} from 'lucide-react';
import SettingsManager from './settings-manager';
import TopicsPanel from './topics-panel';
import SitesPanel from './sites-panel';
import FiltersPanel from './filters-panel';
import type {SettingsBackup} from '@/lib/browser-library';
import type {Topic,NewsSite,Audience} from '@/lib/news';

export type SettingsTab='topics'|'sites'|'filters'|'backup';
const tabs:{id:SettingsTab;label:string;icon:typeof Save}[]=[
 {id:'topics',label:'Keyword Topics',icon:ListFilter},
 {id:'sites',label:'Source sites',icon:Globe},
 {id:'filters',label:'Reading filters',icon:ShieldCheck},
 {id:'backup',label:'Save settings',icon:Save},
];

// One place for everything that configures the reader. These were three
// separate surfaces — a masthead button and two strips above the stories —
// which left the page describing its own settings instead of showing news.
export default function SettingsDialog(props:{
 open:boolean;onOpenChange:(open:boolean)=>void;tab:SettingsTab;onTabChange:(tab:SettingsTab)=>void;
 topics:Topic[];onSaveTopics:(topics:Topic[])=>Promise<void>|void;
 sites:NewsSite[];onSitesChange:(sites:NewsSite[])=>void;keywords:string;
 sources:string[];onSourcesChange:(next:string[])=>void;
 removedSources:string[];onRemovedSourcesChange:(next:string[])=>void;
 maxAudience:Audience;blockedWords:string[];onSaveFilters:(next:{maxAudience:Audience;blockedWords:string[]})=>Promise<void>|void;
 fontSize:number;libraryReady:boolean;onApplyBackup:(backup:SettingsBackup)=>void;
}){
 const [busy]=useState(false);
 const close=()=>props.onOpenChange(false);
 return <Dialog open={props.open} onOpenChange={value=>{if(!busy)props.onOpenChange(value);}}>
  <DialogContent className="editor settings-dialog">
   <DialogTitle>Settings</DialogTitle>
   <div className="settings-tabs" role="tablist">{tabs.map(({id,label,icon:Icon})=>
    <button key={id} role="tab" aria-selected={props.tab===id} className={'settings-tab '+(props.tab===id?'is-on':'')} onClick={()=>props.onTabChange(id)}><Icon size={15}/>{label}</button>
   )}</div>
   {props.tab==='topics'&&<TopicsPanel topics={props.topics} onSave={props.onSaveTopics} onDone={close}/>}
   {props.tab==='sites'&&<SitesPanel sites={props.sites} onChange={props.onSitesChange} keywords={props.keywords} sources={props.sources} onSourcesChange={props.onSourcesChange} removedSources={props.removedSources} onRemovedSourcesChange={props.onRemovedSourcesChange}/>}
   {props.tab==='filters'&&<FiltersPanel sites={props.sites} removedSources={props.removedSources} maxAudience={props.maxAudience} blockedWords={props.blockedWords} onSave={props.onSaveFilters} onDone={close}/>}
   {props.tab==='backup'&&<SettingsManager fontSize={props.fontSize} ready={props.libraryReady} onApply={props.onApplyBackup} onDone={close}/>}
  </DialogContent>
 </Dialog>;
}
