/* v1.4.0: the gameplay scroll rail is retired. Retain an inert API for cached hosts. */
(()=>{"use strict";const hide=()=>document.querySelectorAll(".arcade-mobile-scroll-rail").forEach(el=>{el.hidden=true;el.remove();});window.ArcadeScrollRail={show:hide,hide,refresh:hide};hide();})();
