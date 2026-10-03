const fs = require('fs');
let s = fs.readFileSync('public/app.js', 'utf8');

// 1. Remove TOUR_STEPS_BY_ROLE and getTourSteps
s = s.replace(/const TOUR_STEPS_BY_ROLE = \{[\s\S]*?\n\};\n\nfunction getTourSteps\(\) \{[\s\S]*?\n\}\n+/, '');

// 2. Remove renderTour and scheduleTourAutoplay functions
s = s.replace(/function renderTour\(\) \{[\s\S]*?\n\}\n\nfunction scheduleTourAutoplay\(ms\) \{[\s\S]*?\n\}\n+/, '');

// 3. Remove tour button from header
s = s.replace(/<button class="s" data-a="tour-start" title="Replay Guided Walkthrough">Tour [^<]+<\/button>/, '');

// 4. Remove 'if (TOUR_MODAL || TOUR_ACTIVE) { renderTour(); }'
s = s.replace(/\n\s*if \(TOUR_MODAL \|\| TOUR_ACTIVE\) \{\s*renderTour\(\);\s*\}/, '');

// 5. In register action, remove TOUR_MODAL, TOUR_STEP, TOUR_ACTIVE
s = s.replace(/\s*TOUR_MODAL = 'welcome';\s*TOUR_STEP = 0;\s*TOUR_ACTIVE = false;/, '');

// 6. In login action, remove TOUR_MODAL / sih_tour_done check
s = s.replace(/\s*\/\/ Check if this user has completed the onboarding tour[\s\S]*?TOUR_ACTIVE = false;\s*\}/, '');

// 7. Remove tour event listener handlers
s = s.replace(/\n\s*if \(a === 'tour-start' \|\| a === 'tour-begin'\) \{[\s\S]*?\n\s*if \(a === 'switch-auth-tab'\)/, "\n  if (a === 'switch-auth-tab')");

// 8. In logout, remove tour cleanup calls
s = s.replace(/\s*stopTourAutoplay\(\);\s*TOUR_ACTIVE = false;\s*TOUR_MODAL = null;\s*const old = \$\('tour-root'\);\s*if \(old\) old\.remove\(\);/, '');

// 9. In nav, goto-ledger-block, and filter-sess-by-doc, remove tour checks
const tourBlockRegex = /\s*if \(TOUR_ACTIVE \|\| TOUR_MODAL\) \{\s*stopTourAutoplay\(\);\s*TOUR_ACTIVE = false;\s*TOUR_MODAL = null;\s*document\.querySelectorAll\('\.tour-highlighted-element'\)\.forEach\(node => node\.classList\.remove\('tour-highlighted-element'\)\);\s*const old = \$\('tour-root'\);\s*if \(old\) old\.remove\(\);\s*\}/g;
s = s.replace(tourBlockRegex, '');

fs.writeFileSync('public/app.js', s, 'utf8');
console.log('Successfully cleaned tour code from app.js');
