/* Beagu private account SDK (staging). No UI, buttons, HTML or nav integration.
 * Sessions are memory-only. Passwords, refresh tokens and email are never
 * stored in localStorage, sessionStorage, cookies, analytics or logs here.
 * A page reload intentionally requires a fresh login until a secure
 * first-party server-cookie session architecture is available.
 */
(() => {
  'use strict';
  const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-account-v1';
  function createClient() {
    let accessToken='',refreshToken='',level=0,registered=false,username=null;
    const clear=()=>{
      accessToken='';refreshToken='';level=0;registered=false;username=null;
    };
    async function call(action, body={}, requiresToken=false) {
      if (requiresToken && !accessToken) throw new Error('AUTH_REQUIRED');
      const response=await fetch(endpoint,{
        method:'POST',cache:'no-store',credentials:'omit',
        referrerPolicy:'no-referrer',
        headers:{
          'Content-Type':'application/json',
          ...(requiresToken?{'Authorization':'Bearer '+accessToken}:{})
        },
        body:JSON.stringify({action,...body})
      });
      const json=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(
        typeof json.error==='string' ? json.error : 'ACCOUNT_SERVICE_UNAVAILABLE'
      );
      return json;
    }
    function capture(result) {
      const session=result?.session;
      if(!session?.access_token||!session?.refresh_token)
        throw new Error('AUTH_SESSION_MISSING');
      accessToken=session.access_token;
      refreshToken=session.refresh_token;
      level=Number(result.level)||0;
      registered=result.registered===true;
      return {loggedIn:true,registered,level};
    }
    return Object.freeze({
      async signUp({username:choice,email,password,captchaToken}) {
        return await call('sign-up',{username:choice,email,password,captchaToken});
      },
      async login({username:choice,password,captchaToken}) {
        return capture(await call('sign-in',{username:choice,password,captchaToken}));
      },
      // One-time email login after confirmation; finish registration to reserve ID.
      async beginConfirmedRegistration({email,password,captchaToken}) {
        return capture(await call('bootstrap-sign-in',{email,password,captchaToken}));
      },
      async finishRegistration(usernameChoice) {
        const data=await call('complete-registration',{username:usernameChoice},true);
        registered=data.registered===true;
        username=data.username||null;
        level=Number(data.level)||0;
        return {registered,username,level};
      },
      async me() {
        const data=await call('me',{},true);
        registered=data.registered===true;
        username=data.username||null;
        level=Number(data.level)||0;
        return {loggedIn:true,registered,username,level};
      },
      async refresh() {
        if(!refreshToken) throw new Error('AUTH_REQUIRED');
        return capture(await call('refresh',{refreshToken}));
      },
      async requestPasswordRecovery(email,captchaToken) {
        // Recovery is separately feature-flagged OFF until SMTP/template verified.
        return await call('request-recovery',{email,captchaToken});
      },
      async deleteAccount({password,confirm,captchaToken}) {
        // Sensitive, reauthenticated deletion. Only self-owned Auth ID is used.
        const result=await call('delete-account',{password,confirm,captchaToken},true);
        if(result.accountDeleted===true)clear();
        return result;
      },
      async logout() {
        try {
          if(accessToken) await call('sign-out',{},true);
        } finally { clear(); }
        return {loggedIn:false,level:0};
      },
      status() {
        return {loggedIn:!!accessToken,registered,username,level};
      }
    });
  }
  // The factory does not perform any request or create session on page load.
  Object.defineProperty(window,'BeaguAccountCoreV1',{
    value:Object.freeze({createClient}),writable:false,configurable:false
  });
})();
