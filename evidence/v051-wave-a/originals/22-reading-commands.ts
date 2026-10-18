import type{CruiseBlock}from'../shared/cruise';
export type ReadingCommand={type:'show_evidence';block:CruiseBlock}|{type:'clear_focus'}|{type:'pause_session'};
export function executeReadingCommand(command:ReadingCommand,ports:{showEvidence:(block:CruiseBlock)=>void;clearFocus:()=>void;pause:()=>void}):void{
 if(!command||typeof command!=='object')throw Error('READING_COMMAND_INVALID');
 switch(command.type){
 case'show_evidence':if(!command.block||typeof command.block!=='object')throw Error('READING_COMMAND_INVALID');ports.showEvidence(command.block);return;
 case'clear_focus':ports.clearFocus();return;
 case'pause_session':ports.pause();return;
 default:{const unknown:never=command;throw Error('READING_COMMAND_INVALID');}
 }
}
