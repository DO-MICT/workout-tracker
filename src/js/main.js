renderAll();
if(!window.claude||!claude.use){ seedMyGym(); if(!WEB_MODE) histInit(); }
if(WEB_MODE) webStart(); else startOnboarding();
