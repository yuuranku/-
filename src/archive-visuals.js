const frame = (label, content) => `
  <svg viewBox="0 0 520 520" aria-hidden="true" focusable="false" shape-rendering="geometricPrecision">
    <defs>
      <pattern id="dots-${label}" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="2" height="2" fill="currentColor" />
      </pattern>
    </defs>
    <circle cx="260" cy="260" r="218" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 8" opacity=".34" />
    ${content}
  </svg>`;

export const ARCHIVE_VISUALS = {
  countries: frame('countries', `
    <path d="M136 180L206 128 286 142 358 116 402 178 368 244 406 306 342 382 250 398 172 358 116 278Z" fill="none" stroke="currentColor" stroke-width="5" />
    <path d="M174 194L228 210 252 174 292 214 350 190M144 274L214 252 270 286 330 252 390 284M186 350L238 316 300 350 352 318" fill="none" stroke="currentColor" stroke-width="3" opacity=".7" />
    <circle cx="222" cy="254" r="9" class="blue-fill"/><circle cx="326" cy="246" r="9" class="red-fill"/>
  `),
  organizations: frame('organizations', `
    <path d="M142 168L260 112 382 184 354 342 258 404 134 328Z" fill="none" stroke="currentColor" stroke-width="3" />
    <path d="M142 168L260 258 382 184M260 112V258M134 328L260 258 354 342M260 258V404" fill="none" stroke="currentColor" stroke-width="3" opacity=".55" />
    <g fill="#080808" stroke="currentColor" stroke-width="5"><circle cx="142" cy="168" r="28"/><circle cx="260" cy="112" r="28"/><circle cx="382" cy="184" r="28"/><circle cx="134" cy="328" r="28"/><circle cx="354" cy="342" r="28"/><circle cx="260" cy="404" r="28"/></g>
    <rect x="212" y="210" width="96" height="96" fill="#e8e8e8" stroke="#080808" stroke-width="6"/><path d="M230 240H290M230 258H290M230 276H272" stroke="#080808" stroke-width="8"/>
  `),
  stations: frame('stations', `
    <path d="M104 346H416M142 346V240L198 202H318L378 242V346M198 202V164H318V202M228 164V126H288V164" fill="none" stroke="currentColor" stroke-width="7" />
    <rect x="182" y="258" width="58" height="44" fill="none" stroke="currentColor" stroke-width="5"/><rect x="280" y="258" width="58" height="44" fill="none" stroke="currentColor" stroke-width="5"/>
    <path d="M258 346V274M116 364H402" stroke="currentColor" stroke-width="4" stroke-dasharray="12 9"/>
    <rect x="128" y="374" width="118" height="18" class="blue-fill"/><rect x="274" y="374" width="118" height="18" class="red-fill"/>
  `),
  entrances: frame('entrances', `
    <path d="M108 148H412L376 212H144Z" fill="none" stroke="currentColor" stroke-width="6"/>
    <path d="M174 212L206 404M346 212L314 404M206 404H314" fill="none" stroke="currentColor" stroke-width="8"/>
    <path d="M204 256H316M210 302H310M218 348H302" stroke="currentColor" stroke-width="5"/>
    <path d="M258 170V382" stroke="currentColor" stroke-width="2" stroke-dasharray="8 10"/>
    <circle cx="258" cy="382" r="18" class="red-fill"/><circle cx="258" cy="170" r="10" class="blue-fill"/>
  `),
  ecology: frame('ecology', `
    <path d="M260 98L210 190H238L176 286H220L152 390H368L300 286H344L282 190H310Z" fill="none" stroke="currentColor" stroke-width="7"/>
    <path d="M260 132V402M118 226H402M102 304H418M86 382H434" stroke="currentColor" stroke-width="2" stroke-dasharray="5 8" opacity=".48"/>
    <path d="M92 214H160M360 292H424M112 370H184" class="blue-stroke" stroke-width="8"/><path d="M360 214H428M96 292H160M334 370H410" class="red-stroke" stroke-width="8"/>
  `),
  people: frame('people', `
    <path d="M118 178H236L256 146H404V392H118Z" fill="#d8d8d8" stroke="#080808" stroke-width="8"/>
    <path d="M154 128H334L382 176V350H154Z" fill="#f2f2f2" stroke="#080808" stroke-width="7" transform="rotate(-5 268 260)"/>
    <circle cx="250" cy="210" r="42" fill="#171717"/>
    <path d="M184 314C190 262 310 262 316 314Z" fill="#171717"/>
    <path d="M314 172L350 208M322 164L358 200" class="red-stroke" stroke-width="7"/>
    <rect x="146" y="354" width="118" height="20" class="blue-fill"/><rect x="276" y="354" width="98" height="20" class="red-fill"/>
  `),
  events: frame('events', `
    <rect x="104" y="122" width="312" height="276" fill="#080808" stroke="currentColor" stroke-width="7"/>
    <path d="M104 162H416M104 358H416" stroke="currentColor" stroke-width="4"/>
    <g fill="currentColor"><rect x="118" y="134" width="24" height="16"/><rect x="160" y="134" width="24" height="16"/><rect x="202" y="134" width="24" height="16"/><rect x="244" y="134" width="24" height="16"/><rect x="286" y="134" width="24" height="16"/><rect x="328" y="134" width="24" height="16"/><rect x="370" y="134" width="24" height="16"/></g>
    <g fill="currentColor"><rect x="118" y="370" width="24" height="16"/><rect x="160" y="370" width="24" height="16"/><rect x="202" y="370" width="24" height="16"/><rect x="244" y="370" width="24" height="16"/><rect x="286" y="370" width="24" height="16"/><rect x="328" y="370" width="24" height="16"/><rect x="370" y="370" width="24" height="16"/></g>
    <path d="M126 330L188 244 236 284 282 210 394 330Z" fill="url(#dots-events)"/>
    <circle cx="328" cy="218" r="28" fill="#d8d8d8"/>
    <rect x="122" y="174" width="10" height="166" class="blue-fill"/><rect x="388" y="174" width="10" height="166" class="red-fill"/>
  `),
  abnormalities: frame('abnormalities', `
    <rect x="120" y="116" width="280" height="288" fill="none" stroke="currentColor" stroke-width="5"/>
    <path d="M120 176H400M178 116V404M338 116V404" stroke="currentColor" stroke-width="3" opacity=".55"/>
    <path d="M84 206H270V274H84ZM250 294H438V364H250Z" fill="#080808" stroke="currentColor" stroke-width="6"/>
    <path d="M102 230H230M274 320H410" class="red-stroke" stroke-width="8"/><path d="M102 250H196M274 342H370" class="blue-stroke" stroke-width="8"/>
  `),
  species: frame('species', `
    <path d="M260 120C192 120 144 190 158 258 170 318 214 328 226 396M260 120C328 120 376 190 362 258 350 318 306 328 294 396" fill="none" stroke="currentColor" stroke-width="5"/>
    <path d="M260 154V410M204 188L260 226 316 188M190 270L260 308 330 270M222 354L260 376 298 354" fill="none" stroke="currentColor" stroke-width="4"/>
    <circle cx="192" cy="236" r="10" class="blue-fill"/><circle cx="328" cy="236" r="10" class="red-fill"/>
    <path d="M124 146H182M338 146H396M110 384H178M342 384H410" stroke="currentColor" stroke-width="3" stroke-dasharray="7 7"/>
  `),
};
