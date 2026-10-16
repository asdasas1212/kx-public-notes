'use strict';
(() => {
 const form=document.querySelector('.note-tools');
 if(form){
  const input=document.getElementById('note-search'),buttons=[...document.querySelectorAll('[data-filter]')],rows=[...document.querySelectorAll('.note-row')],status=document.querySelector('.search-status'),empty=document.querySelector('.search-empty');
  let topic='全部';
  function filter(){
   const term=input.value.trim().toLocaleLowerCase();let count=0;
   for(const row of rows){const show=(topic==='全部'||row.dataset.topic===topic)&&row.dataset.search.toLocaleLowerCase().includes(term);row.hidden=!show;if(show)count++;}
   status.textContent=`${count} 篇笔记${topic==='全部'?'':' · '+topic}`;empty.hidden=count>0;
  }
  input.addEventListener('input',filter);
  form.addEventListener('submit',e=>{e.preventDefault();filter()});
  for(const button of buttons)button.addEventListener('click',()=>{topic=button.dataset.filter;for(const b of buttons)b.setAttribute('aria-pressed',String(b===button));filter()});
 }
 const elements=[...document.querySelectorAll('.reveal')];
 if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){e.target.classList.add('is-visible');observer.unobserve(e.target)}},{threshold:.08});
  elements.forEach((e,i)=>{e.style.setProperty('--delay',`${(i%3)*65}ms`);observer.observe(e)});
 }
})();
