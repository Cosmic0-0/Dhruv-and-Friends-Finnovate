import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowIcon, Crosshair, Scanner } from "./Art";
import type { Content } from "./content";
import s from "./landing.module.css";

/**
 * The landing's scroll sections. Server-renderable and animation-free: the
 * motion is layered on by useLandingMotion through the data-* hooks.
 */

/** A labelled static example (not a live result): the SMS, its evidence and the verdict. */
export function ScanScene({ t }: { t: Content["scan"] }) {
  const [urgency, code, link] = t.calls;
  return (
    <section data-scan data-tone="ink" className={`${s.scan} ${s.ink}`} aria-label={t.label}>
      <div>
        <span className={s.eyebrow}>{t.eyebrow}</span>
        <h2 className={s.scanTitle}>{t.title}</h2>
        <span className={s.exampleChip}>{t.example}</span>
      </div>

      <div data-phone className={s.phone}>
        <div className={s.smsHead}>
          <span className={s.avatar} aria-hidden="true">M</span>
          <span style={{ fontWeight: 600 }}>{t.sender}</span>
          <span className={s.smsTime}>{t.channel}</span>
        </div>
        <p lang="mfe" className={s.bubble}>
          Ou kont MCB <Mark>{urgency[0]}</Mark>. <Mark>{code[0]}</Mark> lor <Mark mono>{`${link[0]}/verify`}</Mark>
        </p>
        <ol className={s.calls}>
          {t.calls.map(([, kind, text], i) => (
            <li key={kind} data-call className={s.call}>
              <span className={s.callN} aria-hidden="true">{i + 1}</span>
              <span>
                <span className={s.callKind}>{kind}</span>
                <span className={s.callText}>{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div data-verdict className={s.verdictRow}>
          <span className={s.verdictBadge}>
            <span className={s.verdictLabel}>{t.verdictLabel}</span>
            <span className={s.verdict}>{t.verdict}</span>
          </span>
          <span className={s.confidence}>{t.confidence}</span>
        </div>
        <div data-action className={s.action}>{t.action}</div>
      </div>
    </section>
  );
}

function Mark({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span data-mark className={`${s.mark}${mono ? ` ${s.markMono}` : ""}`}>
      {children}
    </span>
  );
}

/** How the verdict is made: the statement lights up word by word, then the three steps. */
export function Engine({ t }: { t: Content["engine"] }) {
  return (
    <section data-manifesto data-tone="butter" className={`${s.engine} ${s.butter}`}>
      <span className={s.eyebrow}>{t.eyebrow}</span>
      <p data-engine-title className={s.engineTitle}>
        {t.title.split(" ").map((w, i) => (
          <span key={`${w}-${i}`} data-word className={s.word}>{w}</span>
        ))}
      </p>
      <ol data-steps className={s.steps}>
        {t.steps.map((step) => (
          <li key={step.n} data-step className={s.step}>
            <span className={s.stepN}>{step.n}</span>
            <h3 className={s.stepTitle}>{step.title}</h3>
            <p className={s.stepBody}>{step.body}</p>
          </li>
        ))}
      </ol>
      <p className={s.engineNote}>{t.note}</p>
    </section>
  );
}

/** The three ways in: web app, browser extension, Outlook add-in. Mocks are decorative. */
export function Products({ t }: { t: Content["products"] }) {
  const loop = [...t.marquee, ...t.marquee];
  return (
    <section data-ext data-tone="ink" className={`${s.products} ${s.ink}`}>
      <div data-marquee className={s.marquee} aria-hidden="true">
        {loop.map((item, i) => (
          <span key={`${item}-${i}`} className={`${s.marqueeItem} ${i % 2 ? s.marqueeOutline : s.marqueeSolid}`}>
            {item}
            <Crosshair className={s.marqueeMark} />
          </span>
        ))}
      </div>

      <div className={s.productsHead}>
        <span className={s.eyebrow}>{t.eyebrow}</span>
        <h2 className={s.productsTitle}>{t.title}</h2>
      </div>

      <div data-chips className={s.clients}>
        <article id="webapp" data-chip className={`${s.client} ${s.clientWide}`}>
          <div className={s.clientText}>
            <span className={s.clientTag}>{t.webapp.tag}</span>
            <h3 className={s.clientTitle}>{t.webapp.title}</h3>
            <p className={s.extText}>{t.webapp.body}</p>
            <div className={s.extCtas}>
              <Link href="/app" className={`${s.pill} ${s.pillSolid}`}><span>{t.webapp.cta}</span></Link>
            </div>
          </div>
          <ul className={s.toolGrid} aria-label={t.webapp.tag}>
            {t.webapp.tools.map((tool, i) => (
              <li key={tool}>
                <span className={s.toolN}>0{i + 1}</span>
                {tool}
              </li>
            ))}
          </ul>
        </article>

        <article id="extension" data-chip className={s.client}>
          <span className={s.clientTag}>{t.extension.tag}</span>
          <h3 className={s.clientTitle}>{t.extension.title}</h3>
          <p className={s.extText}>{t.extension.body}</p>
          <div className={s.chips} aria-hidden="true">
            <div className={s.chip}>
              <span className={`${s.chipIcon} ${s.chipBad}`}>!</span>
              <span>
                <span className={s.chipTitle}>{t.extension.badLink}</span>
                <span className={s.chipDomain}>mcb-secure.top</span>
              </span>
            </div>
            <div className={s.chip}>
              <span className={`${s.chipIcon} ${s.chipOk}`}>✓</span>
              <span>
                <span className={s.chipTitle}>{t.extension.official}</span>
                <span className={s.chipDomain}>mauritiuspost.mu</span>
              </span>
            </div>
          </div>
          <div className={s.extCtas}>
            <Link href="/extension#chrome" className={`${s.pill} ${s.pillSolid}`}><span>{t.extension.cta}</span></Link>
            <Link href="/extension#other-browsers" className={s.pill}><span>{t.extension.cta2}</span></Link>
          </div>
        </article>

        <article id="outlook" data-chip className={s.client}>
          <span className={s.clientTag}>{t.outlook.tag}</span>
          <h3 className={s.clientTitle}>{t.outlook.title}</h3>
          <p className={s.extText}>{t.outlook.body}</p>
          <OutlookMock t={t.outlook.mock} />
          <div className={s.extCtas}>
            <Link href="/extension#outlook" className={`${s.pill} ${s.pillSolid}`}>
              <span>{t.outlook.cta}</span>
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

/** A drawn Outlook reading pane with the FraudLens task pane open beside the email. */
function OutlookMock({ t }: { t: Content["products"]["outlook"]["mock"] }) {
  return (
    <div className={s.mail} aria-hidden="true">
      <div className={s.mailBar}>
        <span className={s.mailDot} />
        <span className={s.mailDot} />
        <span className={s.mailDot} />
        <span className={s.mailApp}>Outlook</span>
      </div>
      <div className={s.mailBody}>
        <div className={s.mailRead}>
          <span className={s.mailFrom}>{t.from}</span>
          <span className={s.mailSubject}>{t.subject}</span>
          <span className={s.mailLine} style={{ width: "92%" }} />
          <span className={s.mailLine} style={{ width: "78%" }} />
          <span className={s.mailLine} style={{ width: "85%" }} />
          <span className={s.mailLink}>mcb-verify.top/login</span>
        </div>
        <div className={s.pane}>
          <span className={s.paneBrand}>FraudLens</span>
          <span className={s.paneVerdict}>{t.verdict}</span>
          <ul className={s.paneRows}>
            {t.rows.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <span className={s.paneBtn}>{t.button}</span>
        </div>
      </div>
    </div>
  );
}

export function Outro({ t }: { t: Content["outro"] }) {
  return (
    <section data-outro data-tone="butter" className={`${s.outro} ${s.butter}`}>
      <div data-seal className={s.outroScanner}>
        <Scanner sweepClassName={s.sweep} />
      </div>
      <h2 data-outro-word className={s.outroTitle}>{t.title}</h2>
      <p className={s.outroText}>{t.body}</p>
      <div className={s.outroCtas}>
        <Link href="/app" className={s.bigCta}>
          {t.cta}
          <ArrowIcon />
        </Link>
        <Link href="/report" className={s.pill}><span>{t.cta2}</span></Link>
      </div>
    </section>
  );
}
