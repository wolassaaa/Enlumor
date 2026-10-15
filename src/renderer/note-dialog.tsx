import {useLayoutEffect,useRef} from 'react';
type Props={returnFocus:HTMLElement|null;value:string;editing:boolean;busy:boolean;pending:boolean;error:string;change:(value:string)=>void;submit:()=>void;cancel:()=>void;dismiss:()=>void};
export function NoteDialog({returnFocus,value,editing,busy,pending,error,change,submit,cancel,dismiss}:Props){
 const dialog=useRef<HTMLDialogElement>(null);
 useLayoutEffect(()=>{const element=dialog.current!;element.showModal();return()=>{element.close();queueMicrotask(()=>{if(returnFocus?.isConnected&&!returnFocus.matches(':disabled'))returnFocus.focus();else document.querySelector<HTMLElement>('#viewerContainer')?.focus();});};},[]);
 return <dialog ref={dialog} className="note-dialog" aria-modal="true" aria-labelledby="note-title" onCancel={event=>{event.preventDefault();if(!busy&&!pending)cancel();}}>
  <form className="note-modal" onSubmit={event=>{event.preventDefault();submit();}}>
   <div className="section-label">NOTE / 原文旁的想法</div><h2 id="note-title">{editing?'编辑便签':'添加便签'}</h2>
   <textarea autoFocus aria-label="便签内容" value={value} maxLength={100000} readOnly={busy||pending} onChange={event=>change(event.target.value)}/>
   {(error||pending)&&!busy&&<div className="note-error" role="alert"><p>{error||'保存未完成，草稿已保留。请重试或明确放弃。'}</p>{error&&<button type="button" aria-label="关闭便签错误详情" onClick={dismiss}>收起详情</button>}</div>}
   <div><button type="button" disabled={busy} onClick={cancel}>{pending?'放弃未保存便签':'取消'}</button><button className="primary" type="submit" disabled={busy||!value.trim()}>{busy?'正在保存…':pending?'重试保存':'保存便签'}</button></div>
  </form>
 </dialog>;
}
