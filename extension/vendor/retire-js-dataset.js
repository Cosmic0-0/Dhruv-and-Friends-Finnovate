// Trimmed subset of the Retire.js JS-library vulnerability signatures.
//
// Source: https://github.com/RetireJS/retire.js/blob/master/repository/jsrepository.json
// License: Apache License 2.0 (https://github.com/RetireJS/retire.js/blob/master/LICENSE.txt)
// Fetched: 2026-09-23. Trimmed to 16 commonly-seen front-end libraries (jQuery,
// jQuery UI, jQuery Migrate, AngularJS, Lodash, Moment.js, Bootstrap,
// Handlebars, Backbone.js, Mustache.js, Prototype.js, Knockout, Ember, YUI,
// SWFObject, Plupload) to keep the extension's bundle size reasonable for a
// hackathon build — the full upstream file covers ~76 libraries. Each
// library keeps only its `uri`/`filecontent` extractor regexes (the two
// kinds retire-js-scan.js can evaluate without executing page JS in the
// MAIN world or hashing a whole file — see that file's header comment) and
// a trimmed `vulnerabilities` array (severity + one summary + one info link
// per entry, dropping the full CVE/CWE/bug-tracker cross-reference lists).
//
// `§§version§§` inside each regex is retire.js's own placeholder for "the
// version-number capture group" — retire-js-scan.js substitutes it with a
// real capturing group before compiling the regex, exactly as upstream
// retire.js does.
//
// Not modified beyond trimming: every regex and version boundary below is
// copied verbatim from the upstream entries kept.

export const RETIRE_JS_DATASET = {
  "jquery": {
    "npmname": "jquery",
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/jquery(\\.min)?\\.js"
      ],
      "filecontent": [
        "/\\*!? jQuery v(\u00a7\u00a7version\u00a7\u00a7)",
        "\\* jQuery JavaScript Library v(\u00a7\u00a7version\u00a7\u00a7)",
        "\\* jQuery (\u00a7\u00a7version\u00a7\u00a7) - New Wave Javascript",
        "/\\*![\\s]+\\* jQuery JavaScript Library v(\u00a7\u00a7version\u00a7\u00a7)",
        "// \\$Id: jquery.js,v (\u00a7\u00a7version\u00a7\u00a7)",
        "/\\*! jQuery v(\u00a7\u00a7version\u00a7\u00a7)",
        "[^a-z]f=\"(\u00a7\u00a7version\u00a7\u00a7)\",.*[^a-z]jquery:f,",
        "[^a-z]m=\"(\u00a7\u00a7version\u00a7\u00a7)\",.*[^a-z]jquery:m,",
        "[^a-z.]jquery:[ ]?\"(\u00a7\u00a7version\u00a7\u00a7)\"",
        "\\$\\.documentElement,Q=e.jQuery,Z=e\\.\\$,ee=\\{\\},te=\\[\\],ne=\"(\u00a7\u00a7version\u00a7\u00a7)\"",
        "=\"(\u00a7\u00a7version\u00a7\u00a7)\",.{50,300}(.)\\.fn=(\\2)\\.prototype=\\{jquery:"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "1.6.3",
        "summary": "XSS with location.hash",
        "info": "http://research.insecurelabs.org/jquery/test/"
      },
      {
        "severity": "medium",
        "below": "1.9.0b1",
        "summary": "Selector interpreted as HTML",
        "info": "http://bugs.jquery.com/ticket/11290"
      },
      {
        "severity": "medium",
        "below": "1.9.0",
        "atOrAbove": "1.2.1",
        "summary": "Versions of jQuery prior to 1.9.0 are vulnerable to Cross-Site Scripting (XSS). The load method fails to recognize and strip script tags containing whitespace in the closing tag (e.g. </script >), all",
        "info": "https://github.com/advisories/GHSA-q4m3-2j7h-f7xw"
      },
      {
        "severity": "medium",
        "below": "1.12.0",
        "atOrAbove": "1.4.0",
        "summary": "3rd party CORS request may execute",
        "info": "http://blog.jquery.com/2016/01/08/jquery-2-2-and-1-12-released/"
      },
      {
        "severity": "medium",
        "below": "2.2.0",
        "atOrAbove": "1.8.0",
        "summary": "parseHTML() executes scripts in event handlers",
        "info": "http://research.insecurelabs.org/jquery/test/"
      },
      {
        "severity": "low",
        "below": "2.999.999",
        "summary": "jQuery 1.x and 2.x are End-of-Life and no longer receiving security updates",
        "info": "https://github.com/jquery/jquery.com/issues/162"
      },
      {
        "severity": "medium",
        "below": "3.0.0-beta1",
        "atOrAbove": "1.12.3",
        "summary": "3rd party CORS request may execute",
        "info": "http://blog.jquery.com/2016/01/08/jquery-2-2-and-1-12-released/"
      },
      {
        "severity": "medium",
        "below": "3.0.0",
        "atOrAbove": "2.2.2",
        "summary": "parseHTML() executes scripts in event handlers",
        "info": "http://research.insecurelabs.org/jquery/test/"
      },
      {
        "severity": "high",
        "below": "3.0.0",
        "atOrAbove": "3.0.0-rc.1",
        "summary": "Denial of Service in jquery",
        "info": "https://nvd.nist.gov/vuln/detail/CVE-2016-10707"
      },
      {
        "severity": "medium",
        "below": "3.4.0",
        "atOrAbove": "1.1.4",
        "summary": "jQuery before 3.4.0, as used in Drupal, Backdrop CMS, and other products, mishandles jQuery.extend(true, {}, ...) because of Object.prototype pollution",
        "info": "https://blog.jquery.com/2019/04/10/jquery-3-4-0-released/"
      },
      {
        "severity": "medium",
        "below": "3.5.0",
        "atOrAbove": "1.0.3",
        "summary": "passing HTML containing <option> elements from untrusted sources - even after sanitizing it - to one of jQuery's DOM manipulation methods (i.e. .html(), .append(), and others) may execute untrusted co",
        "info": "https://blog.jquery.com/2020/04/10/jquery-3-5-0-released/"
      },
      {
        "severity": "medium",
        "below": "3.5.0",
        "atOrAbove": "1.12.0",
        "summary": "Regex in its jQuery.htmlPrefilter sometimes may introduce XSS",
        "info": "https://blog.jquery.com/2020/04/10/jquery-3-5-0-released/"
      }
    ]
  },
  "jquery-ui": {
    "npmname": "jquery-ui",
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/jquery-ui(\\.min)?\\.js"
      ],
      "filecontent": [
        "/\\*!? jQuery UI - v(\u00a7\u00a7version\u00a7\u00a7)",
        "/\\*!?[\n *]+jQuery UI (\u00a7\u00a7version\u00a7\u00a7)"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "1.13.0",
        "summary": "XSS in the `altField` option of the Datepicker widget",
        "info": "https://github.com/jquery/jquery-ui/security/advisories/GHSA-9gj3-hwp5-pmwc"
      },
      {
        "severity": "medium",
        "below": "1.13.0",
        "summary": "XSS in the `of` option of the `.position()` util",
        "info": "https://github.com/jquery/jquery-ui/security/advisories/GHSA-gpqq-952q-5327"
      },
      {
        "severity": "medium",
        "below": "1.13.0",
        "summary": "XSS Vulnerability on text options of jQuery UI datepicker",
        "info": "https://bugs.jqueryui.com/ticket/15284"
      },
      {
        "severity": "medium",
        "below": "1.13.2",
        "summary": "XSS when refreshing a checkboxradio with an HTML-like initial text label ",
        "info": "https://github.com/advisories/GHSA-h6gj-6jjq-h8g9"
      }
    ]
  },
  "jquery-migrate": {
    "npmname": null,
    "extractors": {
      "uri": [],
      "filecontent": [
        "/\\*!?(?:\n \\*)? jQuery Migrate(?: -)? v(\u00a7\u00a7version\u00a7\u00a7)",
        "\\.migrateVersion ?= ?\"(\u00a7\u00a7version\u00a7\u00a7)\"[\\s\\S]{10,150}(migrateDisablePatches|migrateWarnings|JQMIGRATE)",
        "jQuery\\.migrateVersion ?= ?\"(\u00a7\u00a7version\u00a7\u00a7)\""
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "1.2.0",
        "summary": "cross-site-scripting",
        "info": "http://blog.jquery.com/2013/05/01/jquery-migrate-1-2-0-released/"
      },
      {
        "severity": "medium",
        "below": "1.2.2",
        "summary": "Selector interpreted as HTML",
        "info": "http://bugs.jquery.com/ticket/11290"
      }
    ]
  },
  "angularjs": {
    "npmname": "angular",
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/angular(\\.min)?\\.js"
      ],
      "filecontent": [
        "/\\*[\\*\\s]+(?:@license )?AngularJS(?: NES)? v(\u00a7\u00a7version\u00a7\u00a7)",
        "http://errors\\.angularjs\\.org/(\u00a7\u00a7version\u00a7\u00a7)/"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "1.2.30",
        "atOrAbove": "1.0.0",
        "summary": "The attribute usemap can be used as a security exploit",
        "info": "https://github.com/angular/angular.js/blob/master/CHANGELOG.md#1230-patronal-resurrection-2016-07-21"
      },
      {
        "severity": "medium",
        "below": "1.5.0-beta.1",
        "summary": "XSS through xlink:href attributes",
        "info": "https://github.com/advisories/GHSA-r5fx-8r73-v86c"
      },
      {
        "severity": "medium",
        "below": "1.5.0-rc2",
        "atOrAbove": "1.3.0",
        "summary": "The attribute usemap can be used as a security exploit",
        "info": "https://github.com/angular/angular.js/blob/master/CHANGELOG.md#1230-patronal-resurrection-2016-07-21"
      },
      {
        "severity": "medium",
        "below": "1.6.0",
        "summary": "Cross-Site Scripting via JSONP",
        "info": "https://github.com/advisories/GHSA-28hp-fgcr-2r4h"
      },
      {
        "severity": "medium",
        "below": "1.6.3",
        "summary": "DOS in $sanitize",
        "info": "https://github.com/angular/angular.js/blob/master/CHANGELOG.md"
      },
      {
        "severity": "medium",
        "below": "1.6.3",
        "summary": "Universal CSP bypass via add-on in Firefox",
        "info": "http://pastebin.com/raw/kGrdaypP"
      },
      {
        "severity": "low",
        "below": "1.6.5",
        "summary": "XSS in $sanitize in Safari/Firefox",
        "info": "https://github.com/angular/angular.js/commit/8f31f1ff43b673a24f84422d5c13d6312b2c4d94"
      },
      {
        "severity": "low",
        "below": "1.6.9",
        "atOrAbove": "1.5.0",
        "summary": "XSS through SVG if enableSvg is set",
        "info": "https://github.com/angular/angular.js/blob/master/CHANGELOG.md#169-fiery-basilisk-2018-02-02"
      },
      {
        "severity": "high",
        "below": "1.7.9",
        "summary": "Prototype pollution",
        "info": "https://github.com/angular/angular.js/blob/master/CHANGELOG.md#179-pollution-eradication-2019-11-19"
      },
      {
        "severity": "medium",
        "below": "1.8.0",
        "summary": "XSS via JQLite DOM manipulation functions in AngularJS",
        "info": "https://github.com/advisories/GHSA-5cp4-xmrw-59wf"
      },
      {
        "severity": "medium",
        "below": "1.8.0",
        "summary": "XSS may be triggered in AngularJS applications that sanitize user-controlled HTML snippets before passing them to JQLite methods like JQLite.prepend, JQLite.after, JQLite.append, JQLite.replaceWith, J",
        "info": "https://github.com/advisories/GHSA-5cp4-xmrw-59wf"
      },
      {
        "severity": "medium",
        "below": "1.8.4",
        "summary": "angular vulnerable to regular expression denial of service via the $resource service",
        "info": "https://github.com/advisories/GHSA-2qqx-w9hr-q5gx"
      },
      {
        "severity": "medium",
        "below": "1.8.4",
        "summary": "angular vulnerable to regular expression denial of service via the angular.copy() utility",
        "info": "https://github.com/advisories/GHSA-2vrf-hf26-jrp5"
      },
      {
        "severity": "medium",
        "below": "1.8.4",
        "summary": "Angular (deprecated package) Cross-site Scripting",
        "info": "https://github.com/advisories/GHSA-prc3-vjfx-vhm9"
      },
      {
        "severity": "medium",
        "below": "1.8.4",
        "summary": "angular vulnerable to regular expression denial of service via the <input type=\"url\"> element",
        "info": "https://github.com/advisories/GHSA-qwqh-hm9m-p5hr"
      },
      {
        "severity": "low",
        "below": "1.8.4",
        "atOrAbove": "0",
        "summary": "AngularJS improperly sanitizes SVG elements",
        "info": "https://github.com/advisories/GHSA-j58c-ww9w-pwp5"
      },
      {
        "severity": "low",
        "below": "1.8.4",
        "atOrAbove": "0",
        "summary": "AngularJS allows attackers to bypass common image source restrictions",
        "info": "https://github.com/advisories/GHSA-mqm9-c95h-x2p6"
      },
      {
        "severity": "high",
        "below": "1.8.4",
        "atOrAbove": "1.2.0-rc.3",
        "summary": "Angular's deprecated package has a Cross-Site Scripting issue",
        "info": "https://access.redhat.com/security/cve/CVE-2026-11998"
      },
      {
        "severity": "high",
        "below": "1.8.4",
        "atOrAbove": "1.3.0",
        "summary": "angular vulnerable to super-linear runtime due to backtracking",
        "info": "https://github.com/advisories/GHSA-4w4v-5hc9-xrr2"
      },
      {
        "severity": "low",
        "below": "1.8.4",
        "atOrAbove": "1.3.0-rc.4",
        "summary": "AngularJS allows attackers to bypass common image source restrictions",
        "info": "https://github.com/advisories/GHSA-m9gf-397r-hwpg"
      },
      {
        "severity": "medium",
        "below": "1.8.4",
        "atOrAbove": "1.3.1",
        "summary": "AngularJS Incomplete Filtering of Special Elements vulnerability",
        "info": "https://github.com/advisories/GHSA-4p4w-6hg8-63wx"
      },
      {
        "severity": "medium",
        "below": "1.9.9",
        "atOrAbove": "0",
        "summary": "AngularJS Regular expression Denial of Service (ReDoS)",
        "info": "https://github.com/advisories/GHSA-hfff-63hg-f47j"
      },
      {
        "severity": "low",
        "below": "1.999",
        "summary": "End-of-Life: Long term support for AngularJS has been discontinued as of December 31, 2021",
        "info": "https://docs.angularjs.org/misc/version-support-status"
      },
      {
        "severity": "medium",
        "below": "999.999.999",
        "atOrAbove": "1.7.0",
        "summary": "angular vulnerable to regular expression denial of service (ReDoS)",
        "info": "https://github.com/advisories/GHSA-m2h2-264f-f486"
      }
    ]
  },
  "lodash": {
    "npmname": null,
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/lodash(\\.min)?\\.js"
      ],
      "filecontent": [
        "/\\*[\\s*!]+(?:@license)?[\\s*]+(?:Lo-Dash|lodash|Lodash) v?(\u00a7\u00a7version\u00a7\u00a7)[\\s\\S]{1,200}Build: `lodash modern -o",
        "/\\*[\\s*!]+(?:@license)?[\\s*]+(?:Lo-Dash|lodash|Lodash) v?(\u00a7\u00a7version\u00a7\u00a7) <",
        "/\\*[\\s*!]+(?:@license)?[\\s*]+(?:Lo-Dash|lodash|Lodash) v?(\u00a7\u00a7version\u00a7\u00a7) lodash.com/license",
        "=\"(\u00a7\u00a7version\u00a7\u00a7)(?<=[0-9]{1,2}\\.[0-9]{1,2}\\.[0-9]{1,2})\"[\\s\\S]{1,300}__lodash_hash_undefined__",
        "/\\*[\\s*]+@license[\\s*]+(?:Lo-Dash|lodhash|Lodash)[\\s\\S]{1,500}var VERSION *= *['\"](\u00a7\u00a7version\u00a7\u00a7)['\"]",
        "var VERSION=\"(\u00a7\u00a7version\u00a7\u00a7)\";var BIND_FLAG=1,BIND_KEY_FLAG=2,CURRY_BOUND_FLAG=4,CURRY_FLAG=8"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "4.17.5",
        "summary": "Prototype Pollution in lodash",
        "info": "https://github.com/advisories/GHSA-fvqr-27wr-82fm"
      },
      {
        "severity": "high",
        "below": "4.17.11",
        "summary": "Prototype Pollution in lodash",
        "info": "https://github.com/advisories/GHSA-4xc9-xhrj-v574"
      },
      {
        "severity": "medium",
        "below": "4.17.11",
        "atOrAbove": "4.7.0",
        "summary": "Regular Expression Denial of Service (ReDoS) in lodash",
        "info": "https://github.com/advisories/GHSA-x5rq-j2xg-h7qm"
      },
      {
        "severity": "high",
        "below": "4.17.12",
        "summary": "Prototype Pollution in lodash",
        "info": "https://github.com/advisories/GHSA-jf85-cpcp-j695"
      },
      {
        "severity": "high",
        "below": "4.17.19",
        "atOrAbove": "3.7.0",
        "summary": "Prototype Pollution in lodash",
        "info": "https://github.com/advisories/GHSA-p6mc-m468-83gw"
      },
      {
        "severity": "high",
        "below": "4.17.21",
        "summary": "Command Injection in lodash",
        "info": "https://github.com/advisories/GHSA-35jh-r3h4-6jhm"
      },
      {
        "severity": "medium",
        "below": "4.17.21",
        "atOrAbove": "4.0.0",
        "summary": "Regular Expression Denial of Service (ReDoS) in lodash",
        "info": "https://github.com/advisories/GHSA-29mw-wpgm-hmr9"
      },
      {
        "severity": "medium",
        "below": "4.17.23",
        "atOrAbove": "4.0.0",
        "summary": "Lodash versions 4.0.0 through 4.17.22 are vulnerable to prototype pollution via the _.unset and _.omit functions. An attacker can pass crafted paths to delete methods from global prototypes such as Ob",
        "info": "https://github.com/lodash/lodash/security/advisories/GHSA-xxjr-mmjv-4gpg"
      },
      {
        "severity": "medium",
        "below": "4.18.0",
        "atOrAbove": "0",
        "summary": "Lodash 4.17.23 and earlier are vulnerable to a prototype pollution bypass in _.unset and _.omit. The fix for CVE-2025-13465 only guards against string key members, so attackers can bypass it by passin",
        "info": "https://github.com/lodash/lodash/security/advisories/GHSA-f23m-r3pf-42rh"
      },
      {
        "severity": "high",
        "below": "4.18.0",
        "atOrAbove": "4.0.0",
        "summary": "Lodash _.template is vulnerable to code injection via unsanitized options.imports key names. Untrusted key names are passed to the Function() constructor sink without validation, and the use of assign",
        "info": "https://github.com/lodash/lodash/security/advisories/GHSA-r5fr-rjxr-66jc"
      }
    ]
  },
  "moment.js": {
    "npmname": "moment",
    "extractors": {
      "uri": [
        "/moment\\.js/(\u00a7\u00a7version\u00a7\u00a7)/moment(.min)?\\.js"
      ],
      "filecontent": [
        "//!? moment.js(?:[\n\r]+)//!? version : (\u00a7\u00a7version\u00a7\u00a7)",
        "/\\* Moment.js +\\| +version : (\u00a7\u00a7version\u00a7\u00a7) \\|",
        "\\.version=\"(\u00a7\u00a7version\u00a7\u00a7)\".{20,60}\"isBefore\".{20,60}\"isAfter\".{200,500}\\.isMoment=",
        "\\.version=\"(\u00a7\u00a7version\u00a7\u00a7)\".{20,300}duration.{2,100}\\.isMoment=",
        "\\.isMoment\\(.{50,400}_isUTC.{50,400}=\"(\u00a7\u00a7version\u00a7\u00a7)\"",
        "=\"(\u00a7\u00a7version\u00a7\u00a7)\".{300,1000}Years:31536e6.{60,80}\\.isMoment",
        "// Moment.js is freely distributable under the terms of the MIT license.[\\s]+//[\\s]+// Version (\u00a7\u00a7version\u00a7\u00a7)"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "2.11.2",
        "summary": "reDOS - regular expression denial of service",
        "info": "https://github.com/moment/moment/issues/2936"
      },
      {
        "severity": "medium",
        "below": "2.15.2",
        "summary": "Regular Expression Denial of Service (ReDoS)",
        "info": "https://security.snyk.io/vuln/npm:moment:20161019"
      },
      {
        "severity": "high",
        "below": "2.19.3",
        "summary": "Regular Expression Denial of Service (ReDoS)",
        "info": "https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-18214"
      },
      {
        "severity": "high",
        "below": "2.29.2",
        "summary": "This vulnerability impacts npm (server) users of moment.js, especially if user provided locale string, eg fr is directly used to switch moment locale.",
        "info": "https://github.com/moment/moment/security/advisories/GHSA-8hfj-j24r-96c4"
      },
      {
        "severity": "high",
        "below": "2.29.4",
        "atOrAbove": "2.18.0",
        "summary": "Regular Expression Denial of Service (ReDoS), Affecting moment package, versions >=2.18.0 <2.29.4",
        "info": "https://github.com/moment/moment/security/advisories/GHSA-wc69-rhjr-hc9g"
      }
    ]
  },
  "bootstrap": {
    "npmname": null,
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/bootstrap(\\.min)?\\.js",
        "/(\u00a7\u00a7version\u00a7\u00a7)/js/bootstrap(\\.min)?\\.js"
      ],
      "filecontent": [
        "/\\*!? Bootstrap v(\u00a7\u00a7version\u00a7\u00a7)",
        "\\* Bootstrap v(\u00a7\u00a7version\u00a7\u00a7)",
        "/\\*! Bootstrap v(\u00a7\u00a7version\u00a7\u00a7)",
        "this\\.close\\)\\};.\\.VERSION=\"(\u00a7\u00a7version\u00a7\u00a7)\"(?:,.\\.TRANSITION_DURATION=150)?,.\\.prototype\\.close"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "2.1.0",
        "summary": "cross-site scripting vulnerability",
        "info": "https://github.com/twbs/bootstrap/pull/3421"
      },
      {
        "severity": "medium",
        "below": "3.4.0",
        "summary": "In Bootstrap before 3.4.0, XSS is possible in the tooltip data-viewport attribute.",
        "info": "https://nvd.nist.gov/vuln/detail/CVE-2018-20676"
      },
      {
        "severity": "medium",
        "below": "3.4.0",
        "summary": "In Bootstrap before 3.4.0, XSS is possible in the affix configuration target property.",
        "info": "https://github.com/advisories/GHSA-ph58-4vrj-w6hr"
      },
      {
        "severity": "medium",
        "below": "3.4.0",
        "atOrAbove": "2.3.0",
        "summary": "XSS in collapse data-parent attribute",
        "info": "https://github.com/twbs/bootstrap/issues/20184"
      },
      {
        "severity": "medium",
        "below": "3.4.0",
        "atOrAbove": "2.3.0",
        "summary": "XSS in data-container property of tooltip",
        "info": "https://github.com/twbs/bootstrap/issues/20184"
      },
      {
        "severity": "medium",
        "below": "3.4.0",
        "atOrAbove": "3.0.0",
        "summary": "XSS is possible in the data-target attribute.",
        "info": "https://github.com/advisories/GHSA-4p24-vmcr-4gqj"
      },
      {
        "severity": "medium",
        "below": "3.4.1",
        "atOrAbove": "3.0.0",
        "summary": "XSS in data-template, data-content and data-title properties of tooltip/popover",
        "info": "https://github.com/advisories/GHSA-9v3m-8fp8-mj99"
      },
      {
        "severity": "medium",
        "below": "3.4.2",
        "atOrAbove": "1.4.0",
        "summary": "Bootstrap Cross-Site Scripting (XSS) vulnerability for data-* attributes",
        "info": "https://github.com/advisories/GHSA-vxmc-5x29-h64v"
      },
      {
        "severity": "medium",
        "below": "3.4.2",
        "atOrAbove": "3.4.1",
        "summary": "Improper Neutralization of Input During Web Page Generation (XSS or 'Cross-site Scripting') vulnerability in Bootstrap allows Cross-Site Scripting (XSS). This issue affects Bootstrap version 3.4.1. At",
        "info": "https://lists.debian.org/debian-lts-announce/2025/06/msg00001.html"
      },
      {
        "severity": "low",
        "below": "3.999.999",
        "summary": "Bootstrap before 4.0.0 is end-of-life and no longer maintained.",
        "info": "https://github.com/twbs/bootstrap/issues/20631"
      },
      {
        "severity": "medium",
        "below": "4.0.0-beta.2",
        "atOrAbove": "4.0.0-beta",
        "summary": "XSS is possible in the data-target attribute.",
        "info": "https://github.com/advisories/GHSA-4p24-vmcr-4gqj"
      },
      {
        "severity": "medium",
        "below": "4.1.2",
        "atOrAbove": "4.0.0",
        "summary": "XSS in collapse data-parent attribute",
        "info": "https://github.com/twbs/bootstrap/issues/20184"
      },
      {
        "severity": "medium",
        "below": "4.1.2",
        "atOrAbove": "4.0.0",
        "summary": "XSS in data-container property of tooltip",
        "info": "https://github.com/twbs/bootstrap/issues/20184"
      },
      {
        "severity": "medium",
        "below": "4.1.2",
        "atOrAbove": "4.0.0",
        "summary": "XSS in data-target property of scrollspy",
        "info": "https://github.com/advisories/GHSA-pj7m-g53m-7638"
      },
      {
        "severity": "medium",
        "below": "4.3.1",
        "atOrAbove": "4.0.0",
        "summary": "XSS in data-template, data-content and data-title properties of tooltip/popover",
        "info": "https://github.com/advisories/GHSA-9v3m-8fp8-mj99"
      }
    ]
  },
  "handlebars": {
    "npmname": null,
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/handlebars(\\.min)?\\.js"
      ],
      "filecontent": [
        "Handlebars.VERSION = \"(\u00a7\u00a7version\u00a7\u00a7)\";",
        "Handlebars=\\{VERSION:(?:'|\")(\u00a7\u00a7version\u00a7\u00a7)(?:'|\")",
        "this.Handlebars=\\{\\};[\n\r \t]+\\(function\\([a-z]\\)\\{[a-z].VERSION=(?:'|\")(\u00a7\u00a7version\u00a7\u00a7)(?:'|\")",
        "exports.HandlebarsEnvironment=[\\s\\S]{70,120}exports.VERSION=(?:'|\")(\u00a7\u00a7version\u00a7\u00a7)(?:'|\")",
        "/\\*+![\\s]+(?:@license)?[\\s]+handlebars v+(\u00a7\u00a7version\u00a7\u00a7)",
        "window\\.Handlebars=.,.\\.VERSION=\"(\u00a7\u00a7version\u00a7\u00a7)\"",
        ".\\.HandlebarsEnvironment=.;var .=.\\(.\\),.=.\\(.\\),.=\"(\u00a7\u00a7version\u00a7\u00a7)\";.\\.VERSION="
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "1.0.0.beta.3",
        "summary": "poorly sanitized input passed to eval()",
        "info": "https://github.com/wycats/handlebars.js/pull/68"
      },
      {
        "severity": "high",
        "below": "3.0.7",
        "summary": "A prototype pollution vulnerability in handlebars is exploitable if an attacker can control the template",
        "info": "https://github.com/advisories/GHSA-q42p-pg8m-cqh6"
      },
      {
        "severity": "high",
        "below": "3.0.8",
        "summary": "Versions of Handlebars prior to 3.0.8 or 4.5.2 are vulnerable to Arbitrary Code Execution. The lookup helper fails to properly validate templates, allowing attackers to craft templates that execute ar",
        "info": "https://github.com/advisories/GHSA-2cf5-4w76-r9qv"
      },
      {
        "severity": "high",
        "below": "3.0.8",
        "summary": "Handlebars before 3.0.8 and 4.x before 4.5.3 is vulnerable to Arbitrary Code Execution. The lookup helper fails to properly validate templates, allowing attackers to submit templates that execute arbi",
        "info": "https://github.com/advisories/GHSA-3cqr-58rm-57f8"
      },
      {
        "severity": "high",
        "below": "3.0.8",
        "summary": "Prototype pollution",
        "info": "https://github.com/advisories/GHSA-g9r4-xpmj-mj65"
      },
      {
        "severity": "high",
        "below": "3.0.8",
        "summary": "Handlebars prior to 3.0.8 or 4.5.3 is vulnerable to Arbitrary Code Execution; the lookup helper fails to properly validate templates, allowing attackers to run arbitrary JavaScript in the server or vi",
        "info": "https://github.com/advisories/GHSA-q2c6-c6pm-g3gh"
      },
      {
        "severity": "high",
        "below": "3.0.8",
        "summary": "Disallow calling helperMissing and blockHelperMissing directly",
        "info": "https://github.com/wycats/handlebars.js/blob/master/release-notes.md#v430---september-24th-2019"
      },
      {
        "severity": "medium",
        "below": "4.0.0",
        "summary": "Quoteless attributes in templates can lead to XSS",
        "info": "https://github.com/wycats/handlebars.js/pull/1083"
      },
      {
        "severity": "high",
        "below": "4.0.13",
        "atOrAbove": "4.0.0",
        "summary": "A prototype pollution vulnerability in handlebars is exploitable if an attacker can control the template",
        "info": "https://github.com/wycats/handlebars.js/commit/7372d4e9dffc9d70c09671aa28b9392a1577fd86"
      },
      {
        "severity": "high",
        "below": "4.0.14",
        "atOrAbove": "4.0.0",
        "summary": "A prototype pollution vulnerability in handlebars is exploitable if an attacker can control the template",
        "info": "https://github.com/advisories/GHSA-q42p-pg8m-cqh6"
      },
      {
        "severity": "high",
        "below": "4.1.2",
        "atOrAbove": "4.1.0",
        "summary": "A prototype pollution vulnerability in handlebars is exploitable if an attacker can control the template",
        "info": "https://github.com/advisories/GHSA-q42p-pg8m-cqh6"
      },
      {
        "severity": "high",
        "below": "4.3.0",
        "atOrAbove": "4.0.0",
        "summary": "Disallow calling helperMissing and blockHelperMissing directly",
        "info": "https://github.com/wycats/handlebars.js/blob/master/release-notes.md#v430---september-24th-2019"
      },
      {
        "severity": "high",
        "below": "4.4.5",
        "atOrAbove": "4.0.0",
        "summary": "Regular Expression Denial of Service in Handlebars",
        "info": "https://nvd.nist.gov/vuln/detail/CVE-2019-20922"
      },
      {
        "severity": "medium",
        "below": "4.4.5",
        "atOrAbove": "4.0.0",
        "summary": "Affected versions of Handlebars are vulnerable to Denial of Service. The template parser can be forced into an endless loop when processing specially crafted templates, potentially exhausting system r",
        "info": "https://github.com/handlebars-lang/handlebars.js/commit/f0589701698268578199be25285b2ebea1c1e427"
      },
      {
        "severity": "high",
        "below": "4.5.2",
        "atOrAbove": "4.0.0",
        "summary": "Versions of Handlebars prior to 3.0.8 or 4.5.2 are vulnerable to Arbitrary Code Execution. The lookup helper fails to properly validate templates, allowing attackers to craft templates that execute ar",
        "info": "https://github.com/advisories/GHSA-2cf5-4w76-r9qv"
      },
      {
        "severity": "high",
        "below": "4.5.3",
        "atOrAbove": "4.0.0",
        "summary": "Handlebars before 3.0.8 and 4.x before 4.5.3 is vulnerable to Arbitrary Code Execution. The lookup helper fails to properly validate templates, allowing attackers to submit templates that execute arbi",
        "info": "https://github.com/advisories/GHSA-3cqr-58rm-57f8"
      },
      {
        "severity": "high",
        "below": "4.5.3",
        "atOrAbove": "4.0.0",
        "summary": "Prototype pollution",
        "info": "https://github.com/advisories/GHSA-g9r4-xpmj-mj65"
      },
      {
        "severity": "high",
        "below": "4.5.3",
        "atOrAbove": "4.0.0",
        "summary": "Handlebars prior to 3.0.8 or 4.5.3 is vulnerable to Arbitrary Code Execution; the lookup helper fails to properly validate templates, allowing attackers to run arbitrary JavaScript in the server or vi",
        "info": "https://github.com/advisories/GHSA-q2c6-c6pm-g3gh"
      },
      {
        "severity": "medium",
        "below": "4.6.0",
        "summary": "Denial of service",
        "info": "https://github.com/handlebars-lang/handlebars.js/pull/1633"
      },
      {
        "severity": "high",
        "below": "4.7.7",
        "summary": "Prototype Pollution in handlebars",
        "info": "https://nvd.nist.gov/vuln/detail/CVE-2021-23383"
      },
      {
        "severity": "high",
        "below": "4.7.7",
        "summary": "Remote code execution in handlebars when compiling templates",
        "info": "https://nvd.nist.gov/vuln/detail/CVE-2021-23369"
      },
      {
        "severity": "medium",
        "below": "4.7.9",
        "atOrAbove": "4.0.0",
        "summary": "Handlebars is vulnerable to XSS via prototype pollution: the resolvePartial() function looks up partial names with an unguarded property access that traverses the prototype chain. If Object.prototype ",
        "info": "https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-2qvq-rjwj-gvw9"
      },
      {
        "severity": "critical",
        "below": "4.7.9",
        "atOrAbove": "4.0.0",
        "summary": "Handlebars is vulnerable to Remote Code Execution when Handlebars.compile() is passed an attacker-controlled pre-parsed AST object. The value field of a NumberLiteral AST node is emitted directly into",
        "info": "https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-2w6w-674q-4c4q"
      },
      {
        "severity": "high",
        "below": "4.7.9",
        "atOrAbove": "4.0.0",
        "summary": "Handlebars is vulnerable to Remote Code Execution via the @partial-block mechanism. When a helper with write access to the template data context overwrites @partial-block with a crafted Handlebars AST",
        "info": "https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-3mfm-83xf-c92r"
      },
      {
        "severity": "low",
        "below": "4.7.9",
        "atOrAbove": "4.0.0",
        "summary": "Handlebars has a time-of-check/time-of-use flaw in container.lookup() when the compat compile option is enabled. The function uses lookupProperty() as a security gate but then discards its result and ",
        "info": "https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-442j-39wm-28r2"
      },
      {
        "severity": "high",
        "below": "4.7.9",
        "atOrAbove": "4.0.0",
        "summary": "Handlebars is vulnerable to Denial of Service via unregistered decorator syntax. When a template contains a decorator reference to an unregistered decorator (e.g. {{*n}}), the compiled template attemp",
        "info": "https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-9cx6-37pm-9jff"
      },
      {
        "severity": "high",
        "below": "4.7.9",
        "atOrAbove": "4.0.0",
        "summary": "Handlebars is vulnerable to Remote Code Execution through dynamic partial lookups. A crafted object with call: true placed in the template context bypasses resolvePartial() guards and causes the runti",
        "info": "https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-xhpv-hc6g-r9c6"
      },
      {
        "severity": "high",
        "below": "4.7.9",
        "atOrAbove": "4.0.0",
        "summary": "The Handlebars CLI precompiler is vulnerable to code injection through multiple unsanitized inputs: template file names, the namespace (-n), CommonJS path (-c), and AMD path (-h) options are all inter",
        "info": "https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-xjpj-3mr7-gcpf"
      },
      {
        "severity": "medium",
        "below": "4.7.9",
        "atOrAbove": "4.6.0",
        "summary": "Handlebars has an asymmetric prototype method blocklist where __lookupSetter__ is omitted while its counterparts are blocked. When the non-default runtime option allowProtoMethodsByDefault is set to t",
        "info": "https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-7rx3-28cr-v5wh"
      }
    ]
  },
  "backbone.js": {
    "npmname": "backbone",
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/backbone(\\.min)?\\.js"
      ],
      "filecontent": [
        "//[ ]+Backbone.js (\u00a7\u00a7version\u00a7\u00a7)",
        "a=t.Backbone=\\{\\}\\}a.VERSION=\"(\u00a7\u00a7version\u00a7\u00a7)\"",
        "Backbone\\.VERSION *= *[\"'](\u00a7\u00a7version\u00a7\u00a7)[\"']"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "0.5.0",
        "atOrAbove": "0.3.3",
        "summary": "cross-site scripting vulnerability",
        "info": "http://backbonejs.org/#changelog"
      }
    ]
  },
  "mustache.js": {
    "npmname": "mustache",
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/mustache(\\.min)?\\.js"
      ],
      "filecontent": [
        "name:\\s*['\"]mustache.js['\"],\\s*version:\\s*['\"](\u00a7\u00a7version\u00a7\u00a7)['\"]",
        "name=\"mustache.js\"[;,].\\.version=\"(\u00a7\u00a7version\u00a7\u00a7)\"",
        "[^a-z]mustache.version[ ]?=[ ]?(?:'|\")(\u00a7\u00a7version\u00a7\u00a7)(?:'|\")",
        "exports.name[ ]?=[ ]?\"mustache.js\";[\n ]*exports.version[ ]?=[ ]?(?:'|\")(\u00a7\u00a7version\u00a7\u00a7)(?:'|\");"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "high",
        "below": "0.3.1",
        "summary": "execution of arbitrary javascript",
        "info": "https://github.com/janl/mustache.js/issues/112"
      },
      {
        "severity": "high",
        "below": "2.2.1",
        "summary": "weakness in HTML escaping",
        "info": "https://github.com/janl/mustache.js/pull/530"
      }
    ]
  },
  "prototypejs": {
    "npmname": null,
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/prototype(\\.min)?\\.js"
      ],
      "filecontent": [
        "Prototype JavaScript framework, version (\u00a7\u00a7version\u00a7\u00a7)",
        "Prototype[ ]?=[ ]?\\{[ \r\n\t]*Version:[ ]?(?:'|\")(\u00a7\u00a7version\u00a7\u00a7)(?:'|\")"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "high",
        "below": "1.5.1.2",
        "summary": "CVE-2008-7220",
        "info": "http://prototypejs.org/2008/01/25/prototype-1-6-0-2-bug-fixes-performance-improvements-and-security/"
      },
      {
        "severity": "high",
        "below": "1.6.0.2",
        "atOrAbove": "1.6.0",
        "summary": "CVE-2008-7220",
        "info": "http://prototypejs.org/2008/01/25/prototype-1-6-0-2-bug-fixes-performance-improvements-and-security/"
      },
      {
        "severity": "high",
        "below": "1.7.4",
        "summary": "An issue was discovered in the stripTags and unescapeHTML components in Prototype 1.7.3 where an attacker can cause a Regular Expression Denial of Service (ReDOS) through stripping crafted HTML tags.",
        "info": "https://nvd.nist.gov/vuln/detail/CVE-2020-27511"
      }
    ]
  },
  "knockout": {
    "npmname": null,
    "extractors": {
      "uri": [
        "/knockout/(\u00a7\u00a7version\u00a7\u00a7)/knockout(-[a-z.]+)?\\.js"
      ],
      "filecontent": [
        "(?:\\*|//) Knockout JavaScript library v(\u00a7\u00a7version\u00a7\u00a7)",
        ".version=\"(\u00a7\u00a7version\u00a7\u00a7)\",_.b\\(.version.,_.version\\),_.options=\\{deferUpdates:!1,useOnlyNativeEvents:!1,foreachHidesDestroyed:!1\\}"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "3.5.0",
        "summary": "XSS injection point in attr name binding for browser IE7 and older",
        "info": "https://github.com/knockout/knockout/issues/1244"
      }
    ]
  },
  "ember": {
    "npmname": null,
    "extractors": {
      "uri": [
        "/(?:v)?(\u00a7\u00a7version\u00a7\u00a7)/ember(\\.min)?\\.js",
        "/ember\\.?js/(\u00a7\u00a7version\u00a7\u00a7)/ember((\\.|-)[a-z\\-.]+)?\\.js"
      ],
      "filecontent": [
        "Project:   Ember -(?:.*\n){9,11}// Version: v(\u00a7\u00a7version\u00a7\u00a7)",
        "// Version: v(\u00a7\u00a7version\u00a7\u00a7)(.*\n){10,15}(Ember Debug|@module ember|@class ember)",
        "Ember.VERSION[ ]?=[ ]?(?:'|\")(\u00a7\u00a7version\u00a7\u00a7)(?:'|\")",
        "meta\\.revision=\"Ember@(\u00a7\u00a7version\u00a7\u00a7)\"",
        "e\\(\"ember/version\",\\[\"exports\"\\],function\\(e\\)\\{\"use strict\";?[\\s]*e(?:\\.|\\[\")default(?:\"\\])?=\"(\u00a7\u00a7version\u00a7\u00a7)\"",
        "\\(\"ember/version\",\\[\"exports\"\\],function\\(e\\)\\{\"use strict\";.{1,70}\\.default=\"(\u00a7\u00a7version\u00a7\u00a7)\"",
        "/\\*![\\s]+\\* @overview  Ember - JavaScript Application Framework[\\s\\S]{0,400}\\* @version   (\u00a7\u00a7version\u00a7\u00a7)",
        "// Version: (\u00a7\u00a7version\u00a7\u00a7)[\\s]+\\(function\\(\\) *\\{[\\s]*/\\*\\*[\\s]+@module ember[\\s]",
        "Object\\.defineProperty\\(\\{__proto__:null,CI:!1,DEBUG:!1\\},Symbol\\.toStringTag,\\{value:\"Module\"\\}\\),\\w+=\"(\u00a7\u00a7version\u00a7\u00a7)\"",
        "isLowLevelRegister:function\\(e\\)\\{return e<=3\\}\\},Symbol\\.toStringTag,\\{value:\"Module\"\\}\\),\\w+=\"(\u00a7\u00a7version\u00a7\u00a7)\""
      ]
    },
    "vulnerabilities": [
      {
        "severity": "high",
        "below": "0.9.7",
        "summary": "Bound attributes aren't escaped properly",
        "info": "https://github.com/emberjs/ember.js/issues/699"
      },
      {
        "severity": "low",
        "below": "0.9.7.1",
        "summary": "More rigorous XSS escaping from bindAttr",
        "info": "https://github.com/emberjs/ember.js/blob/master/CHANGELOG.md"
      },
      {
        "severity": "medium",
        "below": "1.0.0-rc.1.1",
        "atOrAbove": "1.0.0-rc.1",
        "summary": "CVE-2013-4170",
        "info": "https://groups.google.com/forum/#!topic/ember-security/dokLVwwxAdM"
      },
      {
        "severity": "medium",
        "below": "1.0.0-rc.2.1",
        "atOrAbove": "1.0.0-rc.2",
        "summary": "CVE-2013-4170",
        "info": "https://groups.google.com/forum/#!topic/ember-security/dokLVwwxAdM"
      },
      {
        "severity": "medium",
        "below": "1.0.0-rc.3.1",
        "atOrAbove": "1.0.0-rc.3",
        "summary": "CVE-2013-4170",
        "info": "https://groups.google.com/forum/#!topic/ember-security/dokLVwwxAdM"
      },
      {
        "severity": "medium",
        "below": "1.0.0-rc.4.1",
        "atOrAbove": "1.0.0-rc.4",
        "summary": "CVE-2013-4170",
        "info": "https://groups.google.com/forum/#!topic/ember-security/dokLVwwxAdM"
      },
      {
        "severity": "medium",
        "below": "1.0.0-rc.5.1",
        "atOrAbove": "1.0.0-rc.5",
        "summary": "CVE-2013-4170",
        "info": "https://groups.google.com/forum/#!topic/ember-security/dokLVwwxAdM"
      },
      {
        "severity": "medium",
        "below": "1.0.0-rc.6.1",
        "atOrAbove": "1.0.0-rc.6",
        "summary": "CVE-2013-4170",
        "info": "https://groups.google.com/forum/#!topic/ember-security/dokLVwwxAdM"
      },
      {
        "severity": "low",
        "below": "1.0.1",
        "atOrAbove": "1.0.0",
        "summary": "CVE-2014-0013",
        "info": "https://groups.google.com/forum/#!topic/ember-security/2kpXXCxISS4"
      },
      {
        "severity": "low",
        "below": "1.1.3",
        "atOrAbove": "1.1.0",
        "summary": "CVE-2014-0013",
        "info": "https://groups.google.com/forum/#!topic/ember-security/2kpXXCxISS4"
      },
      {
        "severity": "low",
        "below": "1.2.1",
        "atOrAbove": "1.2.0",
        "summary": "CVE-2014-0013",
        "info": "https://groups.google.com/forum/#!topic/ember-security/2kpXXCxISS4"
      },
      {
        "severity": "low",
        "below": "1.2.2",
        "atOrAbove": "1.2.0",
        "summary": "ember-routing-auto-location can be forced to redirect to another domain",
        "info": "https://github.com/emberjs/ember.js/blob/v1.5.0/CHANGELOG.md"
      },
      {
        "severity": "low",
        "below": "1.3.1",
        "atOrAbove": "1.3.0",
        "summary": "CVE-2014-0013",
        "info": "https://groups.google.com/forum/#!topic/ember-security/2kpXXCxISS4"
      },
      {
        "severity": "low",
        "below": "1.3.2",
        "atOrAbove": "1.3.0",
        "summary": "ember-routing-auto-location can be forced to redirect to another domain",
        "info": "https://github.com/emberjs/ember.js/blob/v1.5.0/CHANGELOG.md"
      },
      {
        "severity": "low",
        "below": "1.4.0-beta.2",
        "atOrAbove": "1.4.0",
        "summary": "CVE-2014-0013",
        "info": "https://groups.google.com/forum/#!topic/ember-security/2kpXXCxISS4"
      },
      {
        "severity": "low",
        "below": "1.5.0",
        "summary": "ember-routing-auto-location can be forced to redirect to another domain",
        "info": "https://github.com/emberjs/ember.js/blob/v1.5.0/CHANGELOG.md"
      },
      {
        "severity": "medium",
        "below": "1.11.4",
        "atOrAbove": "1.8.0",
        "summary": "CVE-2015-7565",
        "info": "https://groups.google.com/forum/#!topic/ember-security/OfyQkoSuppY"
      },
      {
        "severity": "medium",
        "below": "1.12.2",
        "atOrAbove": "1.12.0",
        "summary": "CVE-2015-7565",
        "info": "https://groups.google.com/forum/#!topic/ember-security/OfyQkoSuppY"
      },
      {
        "severity": "medium",
        "below": "1.13.12",
        "atOrAbove": "1.13.0",
        "summary": "CVE-2015-7565",
        "info": "https://groups.google.com/forum/#!topic/ember-security/OfyQkoSuppY"
      },
      {
        "severity": "medium",
        "below": "2.0.3",
        "atOrAbove": "2.0.0",
        "summary": "CVE-2015-7565",
        "info": "https://groups.google.com/forum/#!topic/ember-security/OfyQkoSuppY"
      },
      {
        "severity": "medium",
        "below": "2.1.2",
        "atOrAbove": "2.1.0",
        "summary": "CVE-2015-7565",
        "info": "https://groups.google.com/forum/#!topic/ember-security/OfyQkoSuppY"
      },
      {
        "severity": "medium",
        "below": "2.2.1",
        "atOrAbove": "2.2.0",
        "summary": "CVE-2015-7565",
        "info": "https://groups.google.com/forum/#!topic/ember-security/OfyQkoSuppY"
      },
      {
        "severity": "high",
        "below": "3.24.7",
        "summary": "Prototype pollution",
        "info": "https://blog.emberjs.com/ember-4-8-1-released/"
      },
      {
        "severity": "high",
        "below": "3.28.10",
        "atOrAbove": "3.25.0",
        "summary": "Prototype pollution",
        "info": "https://blog.emberjs.com/ember-4-8-1-released/"
      },
      {
        "severity": "high",
        "below": "4.4.4",
        "atOrAbove": "4.0.0",
        "summary": "Prototype pollution",
        "info": "https://blog.emberjs.com/ember-4-8-1-released/"
      },
      {
        "severity": "high",
        "below": "4.8.1",
        "atOrAbove": "4.5.0",
        "summary": "Prototype pollution",
        "info": "https://blog.emberjs.com/ember-4-8-1-released/"
      },
      {
        "severity": "high",
        "below": "4.9.0-beta.3",
        "atOrAbove": "4.9.0-alpha.1",
        "summary": "Prototype pollution",
        "info": "https://blog.emberjs.com/ember-4-8-1-released/"
      }
    ]
  },
  "YUI": {
    "npmname": "yui",
    "extractors": {
      "uri": [],
      "filecontent": [
        "/*\nYUI (\u00a7\u00a7version\u00a7\u00a7)",
        "/yui/license.(?:html|txt)\nversion: (\u00a7\u00a7version\u00a7\u00a7)"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "2.8.2",
        "atOrAbove": "2.4.0",
        "summary": "CVE-2010-4207",
        "info": "http://www.cvedetails.com/cve/CVE-2010-4207/"
      },
      {
        "severity": "medium",
        "below": "2.8.2",
        "atOrAbove": "2.5.0",
        "summary": "CVE-2010-4208",
        "info": "http://www.cvedetails.com/cve/CVE-2010-4208/"
      },
      {
        "severity": "medium",
        "below": "2.8.2",
        "atOrAbove": "2.8.0",
        "summary": "CVE-2010-4209",
        "info": "http://www.cvedetails.com/cve/CVE-2010-4209/"
      },
      {
        "severity": "medium",
        "below": "2.9.0",
        "summary": "CVE-2010-4710",
        "info": "http://www.cvedetails.com/cve/CVE-2010-4710/"
      },
      {
        "severity": "medium",
        "below": "2.9.1",
        "atOrAbove": "2.4.0",
        "summary": "CVE-2012-5881",
        "info": "http://www.cvedetails.com/cve/CVE-2012-5881/"
      },
      {
        "severity": "medium",
        "below": "2.9.1",
        "atOrAbove": "2.5.0",
        "summary": "CVE-2012-5882",
        "info": "http://www.cvedetails.com/cve/CVE-2012-5882/"
      },
      {
        "severity": "medium",
        "below": "2.9.1",
        "atOrAbove": "2.8.0",
        "summary": "CVE-2012-5883",
        "info": "http://www.cvedetails.com/cve/CVE-2012-5883/"
      },
      {
        "severity": "medium",
        "below": "3.9.2",
        "atOrAbove": "3.2.0",
        "summary": "CVE-2013-4941",
        "info": "http://www.cvedetails.com/cve/CVE-2013-4941/"
      },
      {
        "severity": "medium",
        "below": "3.9.2",
        "atOrAbove": "3.2.0",
        "summary": "CVE-2013-4942",
        "info": "http://www.cvedetails.com/cve/CVE-2013-4942/"
      },
      {
        "severity": "medium",
        "below": "3.10.3",
        "atOrAbove": "3.0.0",
        "summary": "CVE-2013-4939",
        "info": "http://www.cvedetails.com/cve/CVE-2013-4939/"
      },
      {
        "severity": "medium",
        "below": "3.10.11",
        "atOrAbove": "3.0.0",
        "summary": "CVE-2013-4940",
        "info": "http://www.cvedetails.com/cve/CVE-2013-4940/"
      },
      {
        "severity": "medium",
        "below": "3.10.13",
        "atOrAbove": "3.10.12",
        "summary": "CVE-2013-4940",
        "info": "http://www.cvedetails.com/cve/CVE-2013-4940/"
      }
    ]
  },
  "swfobject": {
    "npmname": null,
    "extractors": {
      "uri": [],
      "filecontent": [
        "SWFObject v(\u00a7\u00a7version\u00a7\u00a7) "
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "2.1",
        "summary": "DOM-based XSS",
        "info": "https://github.com/swfobject/swfobject/wiki/SWFObject-Release-Notes#swfobject-v21-beta7-june-6th-2008"
      }
    ]
  },
  "plupload": {
    "npmname": null,
    "extractors": {
      "uri": [
        "/(\u00a7\u00a7version\u00a7\u00a7)/plupload(\\.min)?\\.js"
      ],
      "filecontent": [
        "\\* Plupload - multi-runtime File Uploader(?:\r|\n)+ \\* v(\u00a7\u00a7version\u00a7\u00a7)",
        "var g=\\{VERSION:\"(\u00a7\u00a7version\u00a7\u00a7)\",.*;window.plupload=g\\}"
      ]
    },
    "vulnerabilities": [
      {
        "severity": "medium",
        "below": "1.5.4",
        "summary": "CVE-2012-2401",
        "info": "http://www.cvedetails.com/cve/CVE-2012-2401/"
      },
      {
        "severity": "medium",
        "below": "1.5.5",
        "summary": "CVE-2013-0237",
        "info": "http://www.cvedetails.com/cve/CVE-2013-0237/"
      },
      {
        "severity": "medium",
        "below": "2.1.9",
        "summary": "CVE-2016-4566",
        "info": "https://github.com/moxiecode/plupload/releases"
      },
      {
        "severity": "medium",
        "below": "2.3.7",
        "summary": "Fixed security vulnerability by adding die calls to all php files to prevent them from being executed unless modified.",
        "info": "https://github.com/moxiecode/plupload/releases/tag/v2.3.7"
      },
      {
        "severity": "medium",
        "below": "2.3.8",
        "summary": "Fixed a potential security issue with not entity encoding the file names in the html in the queue/ui widgets.",
        "info": "https://github.com/moxiecode/plupload/releases/tag/v2.3.8"
      },
      {
        "severity": "medium",
        "below": "2.3.9",
        "summary": "Fixed another case of html entities not being encoded that could be exploded by uploading a file name with html in it.",
        "info": "https://github.com/moxiecode/plupload/releases/tag/v2.3.9"
      },
      {
        "severity": "medium",
        "below": "3.1.3",
        "atOrAbove": "3.0.0",
        "summary": "Fixed security vulnerability by adding die calls to all php files to prevent them from being executed unless modified.",
        "info": "https://github.com/moxiecode/plupload/releases/tag/v3.1.3"
      },
      {
        "severity": "medium",
        "below": "3.1.4",
        "atOrAbove": "3.0.0",
        "summary": "Fixed a potential security issue with not entity encoding the file names in the html in the queue/ui widgets.",
        "info": "https://github.com/moxiecode/plupload/releases/tag/v3.1.4"
      },
      {
        "severity": "medium",
        "below": "3.1.5",
        "atOrAbove": "3.0.0",
        "summary": "Fixed another case of html entities not being encoded that could be exploded by uploading a file name with html in it.",
        "info": "https://github.com/moxiecode/plupload/releases/tag/v3.1.5"
      }
    ]
  }
};
