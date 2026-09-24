# -*- coding: utf-8 -*-
"""Emit frontend/scripts/kreol-lexicon.txt: every word attested in real Kreol data.

Regenerates the fixture that `npm run kreol:check` reads. You only need this
if the Kreol dataset changes; the generated lexicon is committed.

  1. Download the KreolMorisienMT dataset (about 1 MB):
       https://aclanthology.org/attachments/2022.findings-aacl.3.Dataset.zip
     from Dabre & Sukhoo, "KreolMorisienMT: A Dataset for Mauritian Creole
     Machine Translation", Findings of AACL-IJCNLP 2022.
  2. Unzip it, and point CORPUS below at the MorisienMT folder.
  3. python scripts/build-kreol-lexicon.py

Sources: KreolMorisienMT (38,549 Kreol sentences) + the project's own
owner-reviewed translation memory.

The Kreol side of KreolMorisienMT is not purely Kreol. It carries proper
nouns, code-switched fragments and some lines left untranslated, so raw word
types from it let common English through: "the", "with", "your", "message",
"account" and 27 other everyday English words all appear in it, which would
make an English string pass a check that is supposed to catch English.

So use the corpus against itself. A word that is far commoner on the English
side than the Kreol side is English, not Kreol, and is dropped — unless the
project's own reviewed Kreol actually uses it, which is how Fraud, PIN, OTP
and channel survive.
"""
import io, os, re, csv, json, collections

HERE = os.path.dirname(os.path.abspath(__file__))
# Where you unzipped the KreolMorisienMT dataset (see the header).
CORPUS = os.environ.get("KREOL_CORPUS", os.path.join(HERE, "MorisienMT"))
D = CORPUS
KD = os.path.join(HERE, "..", "..", "data", "kreol-dataset")
OUT = os.path.join(HERE, "kreol-lexicon.txt")

WORD = re.compile(r"[A-Za-z\u00C0-\u00FF'\u2019-]+")


def count(files):
    c = collections.Counter()
    for f in files:
        for line in io.open(os.path.join(D, f), encoding="utf-8"):
            for w in WORD.findall(line.lower()):
                c[w.strip("'\u2019-")] += 1
    c.pop("", None)
    return c


cr = count(["train.en-cr.cr", "train.fr-cr.cr", "dev.cr", "test.cr"])
en = count(["train.en-cr.en", "dev.en", "test.en"])

# Words the project's own reviewed Kreol uses. These are Kreol by definition.
ours = set()
n_tm = n_corpus = 0
with io.open(os.path.join(KD, "translation-memory.csv"), encoding="utf-8-sig", newline="") as fh:
    for row in csv.DictReader(fh):
        n_tm += 1
        for w in WORD.findall(row["kreol_morisien"].lower()):
            ours.add(w.strip("'\u2019-"))
ours.discard("")

# scam-corpus.csv is deliberately NOT a source. Its original_message column is
# code-switched Kreol/French/English on purpose \u2014 that is the thing the dataset
# exists to capture \u2014 so feeding it in here taught the lexicon 29 everyday
# English words and let English copy pass the check it is meant to fail.
with io.open(os.path.join(KD, "scam-corpus.csv"), encoding="utf-8-sig", newline="") as fh:
    n_corpus = sum(1 for _ in csv.DictReader(fh))

# Kreol words that are also English words, and that this corpus happens to
# use rarely, so the test below would throw them out. Checked by hand against
# their Kreol lines: sit (sit ofisyel), rate (to miss), son (sound).
RESCUE = {"sit", "rate", "son"}

dropped = []
words = set()
for w, n in cr.items():
    if w in ours or w in RESCUE:
        words.add(w)
        continue
    # Commoner in English than in Kreol, and common enough to judge: English.
    if en.get(w, 0) >= 10 and en.get(w, 0) >= 5 * n:
        dropped.append((w, n, en[w]))
        continue
    words.add(w)

words |= ours
words = sorted(w for w in words if w and len(w) <= 40)
io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(words) + "\n")

print("TM rows %d, scam-corpus rows %d" % (n_tm, n_corpus))
print("dropped as English: %d" % len(dropped))
for w, c, e in sorted(dropped, key=lambda t: -t[2])[:25]:
    print("  %-16s kreol %-4d english %d" % (w, c, e))
print("lexicon words: %d (%d bytes)" % (len(words), os.path.getsize(OUT)))
