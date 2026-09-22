# Scam Corpus — Human Review

**24 rows awaiting review.** All currently `draft_generated` / `synthetic_claude`.

This file is generated from `data/kreol-dataset/scam-corpus.csv` for Joshua's
review. Claude has NOT judged any Kreol here as correct, has NOT edited
`scam-corpus.csv`, and has NOT set any row to `owner_reviewed` — see local
`CLAUDE.md` § Critical Rule: Never Fabricate Review. Fill in the Decision /
Corrected fields below per row, then those corrections get applied back to
`scam-corpus.csv` in a follow-up pass.

---

## FL-KM-0001

### Original message

> Ou kont OceanBank pou bloke azordi si ou pa verifye. Kliv lor oceanbank-verify-secure.test touswit.

### English meaning

> Your OceanBank account will be blocked today if you do not verify. Click oceanbank-verify-secure.test immediately.

### Language mix

`mfe`

### Scam type

`bank_impersonation`

### Risk signals

- URGENCY
- THREAT
- SUSPICIOUS_URL
- IMPERSONATION
- SENSITIVE_INFO_REQUEST

### Extracted entities

```json
{
  "organisation": "OceanBank",
  "url": "oceanbank-verify-secure.test",
  "deadline": "today"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** EDIT 
- **Corrected original_message:** Ou kont OceanBank pou bloke zordi si ou pa fer verification. Klik lor oceanbank-verify-secure.test deswit.
- **Corrected english_meaning:**   Your OceanBank account will be blocked today if you do not verify. Click oceanbank-verify-secure.test immediately.
- **Signals to add:**
- **Signals to remove:** SENSITIVE_INFO_REQUEST
- **Notes:**   Fixed "Kliv" → "Klik". Changed "azordi" → "zordi" and "touswit" → "deswit" for more natural Kreol phrasing. The message creates urgency and threatens account blocking, but does not explicitly request sensitive information.

---

## FL-KM-0002

### Original message

> Dear customer, IslandTrust Bank security team pe demande ou konfirm OTP (583291) lor sa nimero-la pou anile enn transaksion sispek.

### English meaning

> Dear customer, the IslandTrust Bank security team is asking you to confirm an OTP (583291) on this number to cancel a suspicious transaction.

### Language mix

`mfe+en`

### Scam type

`otp_theft`

### Risk signals

- OTP_REQUEST
- IMPERSONATION
- AUTHORITY_PRESSURE
- SENSITIVE_INFO_REQUEST

### Extracted entities

```json
{
  "organisation": "IslandTrust Bank",
  "otp": "583291"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** EDIT

- **Corrected original_message:**
> Ser client, IslandTrust Bank security team pe demande ou konfirm enn OTP 583291 lor sa nimero-la pou anile enn transaksion sispek.

- **Corrected english_meaning:**

- **Signals to add:**

- **Signals to remove:**

- **Notes:**
  The current wording does not code-switch naturally for Mauritian Kreol. It reads like an English/French sentence with Kreol words substituted into it rather than something a Mauritian would naturally write. Rewrite the full message naturally rather than correcting individual words.
---

## FL-KM-0003

### Original message

> ALERT SunCoast Bank: To kart inn sispann pou rezon sekirite. Apel sa nimero-la touswit avan 24 er: +230 5xxx xxxx.

### English meaning

> ALERT SunCoast Bank: Your card has been suspended for security reasons. Call this number immediately within 24 hours: +230 5xxx xxxx.

### Language mix

`mfe`

### Scam type

`bank_impersonation`

### Risk signals

- URGENCY
- THREAT
- IMPERSONATION
- SENSITIVE_INFO_REQUEST

### Extracted entities

```json
{
  "organisation": "SunCoast Bank",
  "phone": "+230 5xxx xxxx",
  "deadline": "24 hours"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** EDIT

- **Corrected original_message:**
  Dear customer, IslandTrust Bank security team pe demann ou konfirm OTP 583291 lor sa nimero-la pou anil enn transaksion sispek.

- **Corrected english_meaning:**
  Dear customer, the IslandTrust Bank security team is asking you to confirm OTP 583291 on this number to cancel a suspicious transaction.

- **Corrected language_mix:**
  mfe+en

- **Corrected scam_type:**
  otp_theft

- **Corrected entities:**
  {"organisation":"IslandTrust Bank","otp":"583291"}

- **Signals to add:**
  None

- **Signals to remove:**
  None

- **Notes:**
  Changed "pe demande" to "pe demann" for more natural Kreol. No urgency signal because the message does not impose a deadline or immediate time pressure.
---

## FL-KM-0004

### Original message

> Your Meridian Bank account inn temporarily suspend. Please verifye ou account lor meridianbank-secure-login.test avan minwi.

### English meaning

> Your Meridian Bank account has been temporarily suspended. Please verify your account on meridianbank-secure-login.test before midnight.

### Language mix

`mfe+en`

### Scam type

`account_verification`

### Risk signals

- URGENCY
- SUSPICIOUS_URL
- SENSITIVE_INFO_REQUEST
- IMPERSONATION

### Extracted entities

```json
{
  "organisation": "Meridian Bank",
  "url": "meridianbank-secure-login.test",
  "deadline": "midnight"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0005

### Original message

> Cher client, votre compte OceanBank a ete bloke pou raison de securite. Veuillez confirme votre code PIN immediatement lor sa lyen-la.

### English meaning

> Dear customer, your OceanBank account has been blocked for security reasons. Please confirm your PIN code immediately on this link.

### Language mix

`mfe+fr`

### Scam type

`bank_impersonation`

### Risk signals

- URGENCY
- SENSITIVE_INFO_REQUEST
- IMPERSONATION

### Extracted entities

```json
{
  "organisation": "OceanBank"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0006

### Original message

> Bonzour, ou'nn gagn enn remboursement MRA Rs 8,400. Klik lien la pou resevwar li avan 24h.

### English meaning

> Hello, you have received an MRA refund of Rs 8,400. Click the link to receive it within 24 hours.

### Language mix

`mfe`

### Scam type

`refund_scam`

### Risk signals

- URGENCY
- UNEXPECTED_PAYMENT
- SUSPICIOUS_URL
- IMPERSONATION
- REFUND_LURE

### Extracted entities

```json
{
  "organisation": "MRA",
  "amount": "Rs 8,400",
  "deadline": "24h"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0007

### Original message

> MRA Notice: You have an outstanding tax payment of Rs 12,500. Failure to pay avan 48h pou rezilta dan penalite ek prosekision legal.

### English meaning

> MRA Notice: You have an outstanding tax payment of Rs 12,500. Failure to pay within 48h will result in penalties and legal prosecution.

### Language mix

`mfe+en`

### Scam type

`government_impersonation`

### Risk signals

- URGENCY
- THREAT
- AUTHORITY_PRESSURE
- PAYMENT_REQUEST
- IMPERSONATION

### Extracted entities

```json
{
  "organisation": "MRA",
  "amount": "Rs 12,500",
  "deadline": "48h"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0008

### Original message

> Minister Finans/MRA: Ou dosye ranbours bloke. Konfirm ou numero kont labank touswit lor sa form-la pou nou rezoud sa.

### English meaning

> Ministry of Finance/MRA: Your refund file is blocked. Confirm your bank account number immediately on this form so we can resolve it.

### Language mix

`mfe`

### Scam type

`government_impersonation`

### Risk signals

- URGENCY
- SENSITIVE_INFO_REQUEST
- IMPERSONATION
- AUTHORITY_PRESSURE

### Extracted entities

```json
{
  "organisation": "MRA"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0009

### Original message

> Salut, mo finn avoy larzan par erer lor to mobile money kont. Silvouple retourn Rs 3,000 lor sa numero-la touswit.

### English meaning

> Hi, I sent money by mistake to your mobile money account. Please return Rs 3,000 to this number immediately.

### Language mix

`mfe`

### Scam type

`payment_request`

### Risk signals

- URGENCY
- UNEXPECTED_PAYMENT
- PAYMENT_REQUEST

### Extracted entities

```json
{
  "amount": "Rs 3,000"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0010

### Original message

> Please note our bank details inn sanze pou sa payment-la. New beneficiary account: kindly update avan ou fer transfer.

### English meaning

> Please note our bank details have changed for this payment. New beneficiary account: kindly update before you make the transfer.

### Language mix

`mfe+en`

### Scam type

`merchant_payment_change`

### Risk signals

- CHANGED_PAYMENT_DETAILS
- BENEFICIARY_MISMATCH
- PAYMENT_REQUEST

### Extracted entities

```json
{}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0011

### Original message

> Support PayIsle: Ou pou gagn enn erer lor ou transaksion. Avoy Rs 500 kouma verification fee pou nou debloke ou kont.

### English meaning

> PayIsle Support: You have an error on your transaction. Send Rs 500 as a verification fee so we can unblock your account.

### Language mix

`mfe`

### Scam type

`payment_request`

### Risk signals

- PAYMENT_REQUEST
- IMPERSONATION
- SENSITIVE_INFO_REQUEST

### Extracted entities

```json
{
  "organisation": "PayIsle",
  "amount": "Rs 500"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0012

### Original message

> Mama, mo finn sanz numero. Mo dan enn problem, mo bizin Rs 2,000 touswit. Pa dir personn, avoy lor sa numero-la.

### English meaning

> Mum, I've changed number. I'm in trouble, I need Rs 2,000 immediately. Don't tell anyone, send it to this number.

### Language mix

`mfe`

### Scam type

`family_impersonation`

### Risk signals

- URGENCY
- SECRECY
- NEW_PHONE_NUMBER
- PAYMENT_REQUEST
- IMPERSONATION

### Extracted entities

```json
{
  "amount": "Rs 2,000"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0013

### Original message

> Hi it's me, I lost my old phone so this is my new number. Can't call right now, urgent I need to pay enn bill, ou kapav avoy Rs 4,500 pou mwa?

### English meaning

> Hi it's me, I lost my old phone so this is my new number. Can't call right now, urgently need to pay a bill, can you send Rs 4,500 for me?

### Language mix

`mfe+en`

### Scam type

`family_impersonation`

### Risk signals

- NEW_PHONE_NUMBER
- URGENCY
- PAYMENT_REQUEST
- IMPERSONATION

### Extracted entities

```json
{
  "amount": "Rs 4,500"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0014

### Original message

> C'est moi, j'ai un probleme urgent, mo pa kapav explik par telefone. Envoye Rs 3,500 silvouple, c'est tres urgent, pa dir papa.

### English meaning

> It's me, I have an urgent problem, I can't explain over the phone. Send Rs 3,500 please, it's very urgent, don't tell dad.

### Language mix

`mfe+fr`

### Scam type

`family_impersonation`

### Risk signals

- URGENCY
- SECRECY
- PAYMENT_REQUEST
- IMPERSONATION

### Extracted entities

```json
{
  "amount": "Rs 3,500"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0015

### Original message

> Colis pou ou finn arive dan douane. Peye Rs 650 kouma fre douane lor sa lyen-la avan li retourn expediteur.

### English meaning

> Your parcel has arrived at customs. Pay Rs 650 as a customs fee on this link before it is returned to sender.

### Language mix

`mfe`

### Scam type

`parcel_customs`

### Risk signals

- URGENCY
- PAYMENT_REQUEST
- PARCEL_FEE
- SUSPICIOUS_URL

### Extracted entities

```json
{
  "amount": "Rs 650"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0016

### Original message

> Your parcel could not be delivered. Update ou delivery address ek peye Rs 250 redelivery fee lor track-parcel-mu.test.

### English meaning

> Your parcel could not be delivered. Update your delivery address and pay a Rs 250 redelivery fee on track-parcel-mu.test.

### Language mix

`mfe+en`

### Scam type

`parcel_customs`

### Risk signals

- PAYMENT_REQUEST
- SUSPICIOUS_URL
- PARCEL_FEE

### Extracted entities

```json
{
  "amount": "Rs 250",
  "url": "track-parcel-mu.test"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0017

### Original message

> Investi Rs 5,000 zordi, gagn Rs 15,000 dan 7 zour, garanti san risk. Kontakte mwa lor WhatsApp pou koumans.

### English meaning

> Invest Rs 5,000 today, get Rs 15,000 in 7 days, guaranteed with no risk. Contact me on WhatsApp to start.

### Language mix

`mfe`

### Scam type

`investment`

### Risk signals

- GUARANTEED_RETURN
- PAYMENT_REQUEST
- UNVERIFIED_IDENTITY

### Extracted entities

```json
{
  "amount": "Rs 5,000"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0018

### Original message

> Join our exclusive trading group, guaranteed 30% return chak semenn. Minimum deposit Rs 10,000 par crypto wallet.

### English meaning

> Join our exclusive trading group, guaranteed 30% return every week. Minimum deposit Rs 10,000 via crypto wallet.

### Language mix

`mfe+en`

### Scam type

`investment`

### Risk signals

- GUARANTEED_RETURN
- CRYPTO_REQUEST
- PAYMENT_REQUEST

### Extracted entities

```json
{
  "amount": "Rs 10,000"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0019

### Original message

> Travay fasil kot lakaz, gagn Rs 8,000 par semenn. Zis anvoy Rs 500 pou frais inscription pou konfirm ou plas.

### English meaning

> Easy work from home, earn Rs 8,000 per week. Just send Rs 500 for a registration fee to confirm your place.

### Language mix

`mfe`

### Scam type

`job_scam`

### Risk signals

- PAYMENT_REQUEST
- GUARANTEED_RETURN
- UNVERIFIED_IDENTITY

### Extracted entities

```json
{
  "amount": "Rs 500"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0020

### Original message

> We are hiring for online data entry, no experience needed, Rs 400 par zour. Pay Rs 800 registration fee pou gagn ou starter kit.

### English meaning

> We are hiring for online data entry, no experience needed, Rs 400 per day. Pay Rs 800 registration fee to get your starter kit.

### Language mix

`mfe+en`

### Scam type

`job_scam`

### Risk signals

- PAYMENT_REQUEST
- GUARANTEED_RETURN

### Extracted entities

```json
{
  "amount": "Rs 800"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0021

### Original message

> Congratulations! Ou'nn gagne dan loterie WhatsApp International, prix Rs 50,000. Envoyer vos details bancaires pou reklam li avan 24h, c'est urgent!

### English meaning

> Congratulations! You have won the WhatsApp International lottery, prize Rs 50,000. Send your bank details to claim it within 24h, it's urgent!

### Language mix

`mfe+en+fr`

### Scam type

`prize_lottery`

### Risk signals

- URGENCY
- PRIZE_LURE
- SENSITIVE_INFO_REQUEST
- UNVERIFIED_IDENTITY

### Extracted entities

```json
{
  "amount": "Rs 50,000",
  "deadline": "24h"
}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0022

### Original message

> Ou relve kont mansyel disponib lor ou espas kliyan. Pena aksion pou fer si tou paret korek.

### English meaning

> Your monthly account statement is available in your client space. No action needed if everything looks correct.

### Language mix

`mfe`

### Scam type

`legitimate`

### Risk signals

_(none — legitimate/control row)_

### Extracted entities

```json
{}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0023

### Original message

> Your password was successfully changed on 12 Sep. If this wasn't you, contact support through the app, not this message.

### English meaning

> Your password was successfully changed on 12 Sep. If this wasn't you, contact support through the app, not this message.

### Language mix

`en`

### Scam type

`legitimate`

### Risk signals

_(none — legitimate/control row)_

### Extracted entities

```json
{}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## FL-KM-0024

### Original message

> Rappel: ou'nn ena rendez-vous ar ou konseye labank lindi prosen 10h. Kontakte labank si ou pa disponib.

### English meaning

> Reminder: you have an appointment with your bank advisor next Monday at 10am. Contact the bank if you're not available.

### Language mix

`mfe+fr`

### Scam type

`legitimate`

### Risk signals

_(none — legitimate/control row)_

### Extracted entities

```json
{}
```

### Review questions

1. Does this sound like natural Mauritian Kreol?
2. Would a Mauritian realistically write/code-switch this way?
3. Is the English meaning faithful?
4. Are any important fraud cues lost or mistranslated?
5. Are organisation names, amounts, URLs, phone numbers, codes and other
   entities preserved correctly?
6. Are the assigned risk signals actually supported by the message?
7. Is the scam type appropriate?
8. Does anything sound too French, too English, artificial, or non-Mauritian?

### Review

- **Decision:** APPROVE / EDIT / REJECT
- **Corrected original_message:**
- **Corrected english_meaning:**
- **Signals to add:**
- **Signals to remove:**
- **Notes:**

---

## Progress

| ID | Decision | Reviewed |
|----|----------|----------|
| FL-KM-0001 | | |
| FL-KM-0002 | | |
| FL-KM-0003 | | |
| FL-KM-0004 | | |
| FL-KM-0005 | | |
| FL-KM-0006 | | |
| FL-KM-0007 | | |
| FL-KM-0008 | | |
| FL-KM-0009 | | |
| FL-KM-0010 | | |
| FL-KM-0011 | | |
| FL-KM-0012 | | |
| FL-KM-0013 | | |
| FL-KM-0014 | | |
| FL-KM-0015 | | |
| FL-KM-0016 | | |
| FL-KM-0017 | | |
| FL-KM-0018 | | |
| FL-KM-0019 | | |
| FL-KM-0020 | | |
| FL-KM-0021 | | |
| FL-KM-0022 | | |
| FL-KM-0023 | | |
| FL-KM-0024 | | |
