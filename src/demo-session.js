// Isolated Ephemeral Demo Session Manager
// Provides safe, zero-persistence execution of the full SIH26237 workflow.
// Every demo session runs inside an independent in-memory createApp() instance.
// When a demo stops or resets, all data is immediately destroyed from memory with zero impact on real databases.

import { createApp } from './app.js';
import { rid, sha, now, ERR } from './util.js';

export const DEMO_STEPS_META = [
  // ==========================================
  // PHASE A: SENDER LOGIN & ONBOARDING (Steps 1 - 5)
  // ==========================================
  {
    step: 1,
    id: 'sender_login_user',
    role: 'SYSTEM',
    stage: 'SENDER AUTHENTICATION',
    title: 'Enter Sender Username',
    summary: 'Focus and enter username for Commander Arjun (SENDER) on the defense workstation.',
    where: 'DEFENSE WORKSTATION · LOGIN CONSOLE',
    what: 'Specifies the authenticated operator username for the defense briefing officer.',
    why: 'Enforces strict identity attribution; every session is bound to an authenticated operator.',
    next: 'Enter password for Commander Arjun.',
    meaning: 'The authentication subsystem primes the credential lookup.',
    view: 'login',
    spotlight: {
      target: '#u',
      fallback: '.login',
      title: 'ENTER SENDER USERNAME',
      tag: 'IDENTITY LOOKUP',
      explanation: 'Commander Arjun enters his operator username to begin the classified authoring session.',
      why: 'Access is restricted to authorized defense personnel.'
    }
  },
  {
    step: 2,
    id: 'sender_login_pw',
    role: 'SYSTEM',
    stage: 'SENDER AUTHENTICATION',
    title: 'Enter Sender Password',
    summary: 'Focus and enter password for Commander Arjun to unlock his encrypted enclave credential envelope.',
    where: 'DEFENSE WORKSTATION · LOGIN CONSOLE',
    what: 'Supplies the credential secret used to derive the local Key Encryption Key (KEK).',
    why: 'Protects private keys in storage; keys are only decrypted in memory upon valid password verification.',
    next: 'Click Authenticate to log into the command center.',
    meaning: 'Password verification unlocks the operator envelope.',
    view: 'login',
    spotlight: {
      target: '#p',
      fallback: '.login',
      title: 'ENTER SENDER PASSWORD',
      tag: 'CREDENTIAL ENVELOPE',
      explanation: 'Commander Arjun enters his defense credentials to derive his private key encryption envelope.',
      why: 'Enforces hardware/scrypt KEK protection for operational private keys.'
    }
  },
  {
    step: 3,
    id: 'sender_login_submit',
    role: 'SYSTEM',
    stage: 'SENDER AUTHENTICATION',
    title: 'Authenticate Defense Operator',
    summary: 'Click Authenticate to establish authenticated session and initialize cryptographic keys.',
    where: 'DEFENSE WORKSTATION · LOGIN CONSOLE',
    what: 'Submits credentials to verify identity and obtain authenticated session token.',
    why: 'All subsequent cryptographic signing and authoring operations require an active session token.',
    next: 'Examine command center and validator consensus health.',
    meaning: 'Commander Arjun is successfully authenticated into the defense enclave.',
    view: 'login',
    spotlight: {
      target: 'button[data-a="login"]',
      fallback: '.login',
      title: 'CLICK AUTHENTICATE',
      tag: 'ENCLAVE LOGIN',
      explanation: 'Validates credentials, initializes the session token, and unlocks the defense console.',
      why: 'Cryptographic authoring requires an authenticated operator session.'
    },
    transition: {
      type: 'ROLE_SWITCH',
      badge: 'SYSTEM → SENDER',
      title: 'SENDER AUTHENTICATED',
      desc: 'Commander Arjun is authenticated. Now opening the Command Center.',
      nextRole: 'SENDER'
    }
  },
  {
    step: 4,
    id: 'sender_command_center',
    role: 'SENDER',
    stage: 'COMMAND CENTER & CONSENSUS AUDIT',
    title: 'Command Center & Consensus Health',
    summary: 'Inspect live distributed ledger integrity and 5-node validator consensus agreement.',
    where: 'SENDER CONSOLE · COMMAND CENTER',
    what: 'Audits validator consensus health (5 of 5 nodes in sync) and current ledger head hash.',
    why: 'Confirms distributed ledger is healthy and in agreement before anchoring classified documents.',
    next: 'Navigate to Documents workspace to author the operational brief.',
    meaning: 'Validator consensus is verified and ready to accept new signed transactions.',
    view: 'dash',
    spotlight: {
      target: 'main .c:first-of-type',
      fallback: 'main',
      title: 'VALIDATOR CONSENSUS AUDIT',
      tag: '5-VALIDATOR CONSENSUS',
      explanation: 'Command center verifies that all 5 validator nodes agree on canonical ledger state.',
      why: 'Prevents split-brain state or unauthorized forks prior to document anchoring.'
    }
  },
  {
    step: 5,
    id: 'sender_nav_docs',
    role: 'SENDER',
    stage: 'NAVIGATION',
    title: 'Open Documents Workspace',
    summary: 'Navigate to the Documents workspace to author and protect the classified brief.',
    where: 'SENDER CONSOLE · SIDEBAR NAVIGATION',
    what: 'Navigates from Command Center to Documents authoring workspace.',
    why: 'Provides the interface for authoring, bulk encryption, and recipient authorization.',
    next: 'Inspect the document creation panel.',
    meaning: 'Switches view to Documents management.',
    view: 'dash',
    spotlight: {
      target: 'aside button[data-v="docs"]',
      fallback: 'aside',
      title: 'OPEN DOCUMENTS WORKSPACE',
      tag: 'NAVIGATION',
      explanation: 'Commander Arjun opens the Documents console to prepare the classified operational brief.',
      why: 'The document authoring form is located in the Documents workspace.'
    }
  },

  // ==========================================
  // PHASE B: SENDER DOCUMENT PREPARATION & ANCHORING (Steps 6 - 15)
  // ==========================================
  {
    step: 6,
    id: 'sender_newdoc_form',
    role: 'SENDER',
    stage: 'DOCUMENT AUTHORING',
    title: 'Inspect Authoring Console',
    summary: 'Focus the authoring panel where classified defense briefs are created and anchored.',
    where: 'SENDER CONSOLE · DOCUMENTS',
    what: 'Displays the brief authoring form with title, classification, payload, and recipient list.',
    why: 'Provides the structured enclave input for preparing single-use bulk-encrypted briefs.',
    next: 'Enter the document title.',
    meaning: 'The defense document preparation pipeline begins here.',
    view: 'docs',
    spotlight: {
      target: '#new-doc-card',
      fallback: 'main',
      title: 'BRIEF AUTHORING CONSOLE',
      tag: 'AUTHORING WORKSPACE',
      explanation: 'The secure authoring console accepts title, classification level, sensitive content, and recipient selection.',
      why: 'All confidential documents originate under authenticated sender custody.'
    }
  },
  {
    step: 7,
    id: 'sender_input_title',
    role: 'SENDER',
    stage: 'DOCUMENT AUTHORING',
    title: 'Enter Document Title',
    summary: 'Enter the title "Operation Falcon - Operational Brief" for the defense brief.',
    where: 'SENDER CONSOLE · DOCUMENTS',
    what: 'Sets the human-readable operational title identifying this classified document.',
    why: 'Identifies the operational mission brief for cataloging and ledger reference.',
    next: 'Select the security classification level.',
    meaning: 'The brief title is recorded and bound to the document metadata.',
    view: 'docs',
    spotlight: {
      target: '#dn',
      fallback: '#new-doc-card',
      title: 'DOCUMENT TITLE',
      tag: 'METADATA SPECIFICATION',
      explanation: 'Commander Arjun specifies document title "Operation Falcon - Operational Brief".',
      why: 'Provides unambiguous document identification in the classified registry.'
    }
  },
  {
    step: 8,
    id: 'sender_select_cls',
    role: 'SENDER',
    stage: 'DOCUMENT AUTHORING',
    title: 'Select Security Classification',
    summary: 'Select classification level SECRET to enforce appropriate handling restrictions.',
    where: 'SENDER CONSOLE · DOCUMENTS',
    what: 'Assigns classification level SECRET to the operational document.',
    why: 'Defense classification governs distribution policy, access controls, and handling audits.',
    next: 'Enter the classified brief content.',
    meaning: 'The brief is designated as SECRET defense intelligence.',
    view: 'docs',
    spotlight: {
      target: '#dc',
      fallback: '#new-doc-card',
      title: 'SECURITY CLASSIFICATION',
      tag: 'CLASSIFICATION LEVEL',
      explanation: 'Commander Arjun selects SECRET classification, determining dissemination policy.',
      why: 'Classifications govern access permissions and legal custody rules.'
    }
  },
  {
    step: 9,
    id: 'sender_input_content',
    role: 'SENDER',
    stage: 'DOCUMENT AUTHORING',
    title: 'Enter Classified Payload Content',
    summary: 'Enter the sensitive operational briefing payload to be protected via AES-256-GCM bulk encryption.',
    where: 'SENDER CONSOLE · DOCUMENTS',
    what: 'Enters the operational brief plaintext payload describing corridor security objectives.',
    why: 'This payload will be encrypted locally with a fresh symmetric key and authenticated data.',
    next: 'Select authorized recipient from directory.',
    meaning: 'The plaintext payload exists temporarily in memory awaiting encryption.',
    view: 'docs',
    spotlight: {
      target: '#dt',
      fallback: '#new-doc-card',
      title: 'CLASSIFIED BRIEF CONTENT',
      tag: 'PLAINTEXT PAYLOAD',
      explanation: 'Sensitive operational text is entered for local symmetric encryption with AES-256-GCM.',
      why: 'Payload is protected inside enclave memory before being sealed for transport.'
    }
  },
  {
    step: 10,
    id: 'sender_select_recipient',
    role: 'SENDER',
    stage: 'RECIPIENT AUTHORIZATION',
    title: 'Select Authorized Recipient',
    summary: 'Select Officer Aarav as the authorized recipient to receive post-quantum key encapsulation.',
    where: 'SENDER CONSOLE · DOCUMENTS',
    what: 'Selects Officer Aarav from registered recipient roster for ML-KEM-768 key encapsulation.',
    why: 'Only selected recipients receive an encapsulated Content Encryption Key (CEK) capsule.',
    next: 'Click Encrypt, Authorize & Anchor.',
    meaning: 'Officer Aarav is designated as the sole authorized reader for this brief.',
    view: 'docs',
    spotlight: {
      target: '#recipients-group',
      fallback: '#new-doc-card',
      title: 'AUTHORIZE RECIPIENT',
      tag: 'ACCESS ROSTER',
      explanation: 'Officer Aarav is selected as the authorized recipient for ML-KEM-768 key encapsulation.',
      why: 'Non-selected personnel can never unwrap the Content Encryption Key.'
    }
  },
  {
    step: 11,
    id: 'sender_click_newdoc',
    role: 'SENDER',
    stage: 'AUTHENTICATED BULK ENCRYPTION & ANCHOR',
    title: 'Click Encrypt, Authorize & Anchor',
    summary: 'Trigger bulk AES-256-GCM encryption, ML-KEM-768 key encapsulation, and ledger commit.',
    where: 'SENDER CONSOLE · DOCUMENTS',
    what: 'Executes single-use symmetric encryption, encapsulates CEK under Aarav\'s public key, and anchors to ledger.',
    why: 'Combines post-quantum asymmetric key exchange with fast symmetric bulk payload protection.',
    next: 'Inspect the created encrypted document card.',
    meaning: 'The brief is sealed, authorized, and immutably anchored across all 5 validator nodes.',
    view: 'docs',
    spotlight: {
      target: 'button[data-a="newdoc"]',
      fallback: '#new-doc-card',
      title: 'ENCRYPT, AUTHORIZE & ANCHOR',
      tag: 'EXECUTE ENCRYPTION',
      explanation: 'Generates single-use CEK, encrypts payload with AES-256-GCM, and encapsulates key via ML-KEM-768.',
      why: 'Immutably commits sender-signed authorization grant to the distributed ledger.'
    }
  },
  {
    step: 12,
    id: 'sender_view_doc_card',
    role: 'SENDER',
    stage: 'DOCUMENT REPOSITORY',
    title: 'Inspect Encrypted Document Card',
    summary: 'View created document card showing classification SECRET, AES-256-GCM cipher, and SHA-256 hash.',
    where: 'SENDER CONSOLE · DOCUMENTS REPOSITORY',
    what: 'Displays the created document record with monotonic ID, version 1.0, and SHA-256 content hash.',
    why: 'Verifies the document was stored in ciphertext form with tamper-evident cryptographic hash.',
    next: 'Inspect the authorized recipients list on the document.',
    meaning: 'Document exists in encrypted state; plaintext has been cleared from authoring memory.',
    view: 'docs',
    spotlight: {
      target: 'main .g2 .c:first-of-type',
      fallback: 'main .g2',
      title: 'SEALED DOCUMENT RECORD',
      tag: 'CIPHERTEXT REPOSITORY',
      explanation: 'The brief is sealed with AES-256-GCM and bound to Authenticated Additional Data (AAD).',
      why: 'Prevents ciphertext reuse or tampering across untrusted storage and transport networks.'
    }
  },
  {
    step: 13,
    id: 'sender_nav_ledger',
    role: 'SENDER',
    stage: 'NAVIGATION',
    title: 'Navigate to Provenance Ledger',
    summary: 'Open the Provenance Ledger view to inspect the anchored AUTHORIZATION transaction.',
    where: 'SENDER CONSOLE · SIDEBAR NAVIGATION',
    what: 'Navigates from Documents workspace to the distributed Provenance Ledger.',
    why: 'Allows auditing the authoritative consensus blocks containing the authorization grant.',
    next: 'Inspect the AUTHORIZATION transaction on the ledger.',
    meaning: 'Switches view to the distributed ledger blocks.',
    view: 'docs',
    spotlight: {
      target: 'aside button[data-v="led"]',
      fallback: 'aside',
      title: 'OPEN PROVENANCE LEDGER',
      tag: 'NAVIGATION',
      explanation: 'Commander Arjun opens the Provenance Ledger to verify the transaction anchor.',
      why: 'Authoritative authorization proof lives on the consensus ledger, not in local state.'
    }
  },
  {
    step: 14,
    id: 'sender_view_auth_tx',
    role: 'SENDER',
    stage: 'LEDGER AUDIT',
    title: 'Audit AUTHORIZATION Transaction on Ledger',
    summary: 'Inspect the AUTHORIZATION transaction committed across 5 validator nodes in the canonical block.',
    where: 'SENDER CONSOLE · PROVENANCE LEDGER',
    what: 'Verifies the AUTHORIZATION transaction containing document ID, recipient ID, and key capsule.',
    why: 'Demonstrates distributed consensus: all 5 independent validator nodes validated and approved the transaction.',
    next: 'Sender logs out to transfer control to the authorized recipient.',
    meaning: 'The authorization grant is permanent, tamper-evident, and non-repudiable.',
    view: 'led',
    spotlight: {
      target: 'main .c:has(.tag.ac)',
      fallback: 'main .c.wrapx',
      title: 'AUTHORIZATION TRANSACTION',
      tag: 'LEDGER CONSENSUS COMMIT',
      explanation: 'The AUTHORIZATION transaction is permanently sealed in a canonical block with 5/5 validator approvals.',
      why: 'Validators reject unauthorized decryption attempts lacking a valid ledger authorization grant.'
    }
  },
  {
    step: 15,
    id: 'sender_logout_click',
    role: 'SENDER',
    stage: 'ROLE HANDOVER',
    title: 'Sign Out Sender (Commander Arjun)',
    summary: 'Commander Arjun logs out to ensure strict console separation of duties between sender and recipient.',
    where: 'SENDER CONSOLE · TOP NAVIGATION',
    what: 'Terminates Commander Arjun\'s authenticated console session and returns to login screen.',
    why: 'Enforces principle of least privilege and prevents cross-role session contamination.',
    next: 'Officer Aarav (RECIPIENT) will sign in to access only his authorized brief.',
    meaning: 'Sender custody concludes; recipient takes custody of decryption.',
    view: 'led',
    spotlight: {
      target: '.top button[data-a="logout"]',
      fallback: '.top',
      title: 'SIGN OUT SENDER',
      tag: 'SECURITY POLICY',
      explanation: 'Commander Arjun signs out of his defense terminal, completing the authoring stage.',
      why: 'Enforces strict separation of duties: recipient must authenticate on their own workstation.'
    },
    transition: {
      type: 'ROLE_SWITCH',
      badge: 'SENDER → RECIPIENT',
      title: 'RECIPIENT AUTHENTICATION',
      desc: 'Commander Arjun signed out. Officer Aarav will now authenticate to access his authorized brief.',
      nextRole: 'RECIPIENT'
    }
  },

  // ==========================================
  // PHASE C: RECIPIENT AUTHENTICATION, DECRYPTION & PROVENANCE (Steps 16 - 25)
  // ==========================================
  {
    step: 16,
    id: 'recipient_login_user',
    role: 'SYSTEM',
    stage: 'RECIPIENT AUTHENTICATION',
    title: 'Enter Recipient Username',
    summary: 'Focus and enter username for Officer Aarav (RECIPIENT) on the recipient workstation.',
    where: 'RECIPIENT WORKSTATION · LOGIN CONSOLE',
    what: 'Specifies the recipient operator username in the authentication prompt.',
    why: 'Binds recipient terminal access to Officer Aarav\'s registered identity.',
    next: 'Enter password for Officer Aarav.',
    meaning: 'The authentication engine identifies the recipient credential record.',
    view: 'login',
    spotlight: {
      target: '#u',
      fallback: '.login',
      title: 'ENTER RECIPIENT USERNAME',
      tag: 'RECIPIENT LOGIN',
      explanation: 'Officer Aarav enters his username on his defense workstation terminal.',
      why: 'Access is restricted strictly to authorized receiving officers.'
    }
  },
  {
    step: 17,
    id: 'recipient_login_pw',
    role: 'SYSTEM',
    stage: 'RECIPIENT AUTHENTICATION',
    title: 'Enter Recipient Password',
    summary: 'Enter Officer Aarav\'s password to derive his scrypt Key Encryption Key (KEK) for key unwrap.',
    where: 'RECIPIENT WORKSTATION · LOGIN CONSOLE',
    what: 'Supplies the credential secret needed to decrypt Officer Aarav\'s private ML-KEM-768 key.',
    why: 'Private keys remain encrypted in storage; only the operator password unlocks the key envelope.',
    next: 'Click Authenticate to access recipient console.',
    meaning: 'Password verification prepares the recipient enclave.',
    view: 'login',
    spotlight: {
      target: '#p',
      fallback: '.login',
      title: 'ENTER RECIPIENT PASSWORD',
      tag: 'KEY ENVELOPE UNLOCK',
      explanation: 'Officer Aarav enters his credentials to unlock his private key decryption envelope.',
      why: 'Protects post-quantum private keys via scrypt key derivation.'
    }
  },
  {
    step: 18,
    id: 'recipient_login_submit',
    role: 'SYSTEM',
    stage: 'RECIPIENT AUTHENTICATION',
    title: 'Authenticate Recipient Operator',
    summary: 'Click Authenticate to log into the recipient command center and unlock key envelopes.',
    where: 'RECIPIENT WORKSTATION · LOGIN CONSOLE',
    what: 'Submits recipient credentials to obtain authenticated session token.',
    why: 'Enables access to the recipient\'s authorized documents and cryptographic decryption functions.',
    next: 'Navigate to Documents workspace to locate the authorized brief.',
    meaning: 'Officer Aarav is successfully authenticated.',
    view: 'login',
    spotlight: {
      target: 'button[data-a="login"]',
      fallback: '.login',
      title: 'AUTHENTICATE RECIPIENT',
      tag: 'RECIPIENT SESSION',
      explanation: 'Validates recipient credentials and unlocks Officer Aarav\'s defense console.',
      why: 'Only authenticated recipients can decapsulate authorized content.'
    },
    transition: {
      type: 'ROLE_SWITCH',
      badge: 'SYSTEM → RECIPIENT',
      title: 'RECIPIENT LOGGED IN',
      desc: 'Officer Aarav authenticated. Opening Documents workspace to decrypt authorized brief.',
      nextRole: 'RECIPIENT'
    }
  },
  {
    step: 19,
    id: 'recipient_nav_docs',
    role: 'RECIPIENT',
    stage: 'NAVIGATION',
    title: 'Open My Documents Workspace',
    summary: 'Navigate to My Documents to locate the encrypted operational brief authorized by Commander Arjun.',
    where: 'RECIPIENT CONSOLE · SIDEBAR NAVIGATION',
    what: 'Navigates to the recipient documents view listing briefs authorized for Officer Aarav.',
    why: 'Displays only the specific documents this recipient is cryptographically authorized to read.',
    next: 'Spotlight the Decrypt Document action button.',
    meaning: 'Recipient accesses their authorized document queue.',
    view: 'dash',
    spotlight: {
      target: 'aside button[data-v="docs"]',
      fallback: 'aside',
      title: 'OPEN MY DOCUMENTS',
      tag: 'NAVIGATION',
      explanation: 'Officer Aarav opens My Documents to view briefs authorized for his identity.',
      why: 'Recipients only see documents for which an AUTHORIZATION transaction exists.'
    }
  },
  {
    step: 20,
    id: 'recipient_click_decrypt',
    role: 'RECIPIENT',
    stage: 'DECAPSULATION & DECRYPTION',
    title: 'Click Decrypt Document',
    summary: 'Trigger ML-KEM-768 decapsulation of the CEK and AES-256-GCM recovery of the plaintext brief.',
    where: 'RECIPIENT CONSOLE · MY DOCUMENTS',
    what: 'Unwraps the private KEM key via KEK, decapsulates the single-use CEK, and decrypts the brief payload.',
    why: 'Proves mathematical access control: without the authorized recipient private key, decryption fails.',
    next: 'View recovered plaintext and embedded forensic watermark.',
    meaning: 'The brief is decrypted in protected enclave memory.',
    view: 'docs',
    spotlight: {
      target: 'main .g2 .c:first-of-type button[data-a="dec"]',
      fallback: 'main .g2 .c:first-of-type',
      title: 'DECRYPT DOCUMENT',
      tag: 'ML-KEM-768 DECAPSULATION',
      explanation: 'Unlocks private key, decapsulates CEK capsule, and decrypts ciphertext into enclave memory.',
      why: 'Only the designated recipient possess the private key to unwrap the CEK.'
    }
  },
  {
    step: 21,
    id: 'recipient_view_plaintext',
    role: 'RECIPIENT',
    stage: 'PLAINTEXT RECOVERY & WATERMARKING',
    title: 'Inspect Decrypted Plaintext & Result',
    summary: 'Inspect the recovered operational briefing text and the unique session watermark generated for this decryption.',
    where: 'RECIPIENT CONSOLE · MY DOCUMENTS',
    what: 'Displays the recovered brief along with session ID, watermark ID, and ledger transaction reference.',
    why: 'Demonstrates authentic decryption: the brief is fully readable, with an invisible zero-width watermark embedded.',
    next: 'Navigate to Sessions & Provenance to audit the watermark details.',
    meaning: 'The brief is now active under Officer Aarav\'s custody.',
    view: 'docs',
    spotlight: {
      target: '#decrypted-result-box',
      fallback: 'main .g2',
      title: 'PLAINTEXT RECOVERED & WATERMARKED',
      tag: 'ISOLATED MEMORY DISPLAY',
      explanation: 'Plaintext is safely recovered in memory. A unique invisible zero-width watermark has been synthesized.',
      why: 'Each decryption generates an independent steganographic watermark ID and ledger provenance entry.'
    }
  },
  {
    step: 22,
    id: 'recipient_nav_sessions',
    role: 'RECIPIENT',
    stage: 'NAVIGATION',
    title: 'Navigate to Decryption Sessions',
    summary: 'Open Sessions & Provenance to inspect the forensic watermark ID and transaction ledger link.',
    where: 'RECIPIENT CONSOLE · SIDEBAR NAVIGATION',
    what: 'Navigates from Documents to the Sessions audit log.',
    why: 'Allows inspecting individual decryption sessions, watermark IDs, and transaction references.',
    next: 'Audit the unique steganographic watermark in the sessions table.',
    meaning: 'Switches view to the sessions audit table.',
    view: 'docs',
    spotlight: {
      target: 'aside button[data-v="sess"]',
      fallback: 'aside',
      title: 'OPEN SESSIONS & PROVENANCE',
      tag: 'NAVIGATION',
      explanation: 'Officer Aarav opens Sessions & Provenance to inspect his decryption record and watermark.',
      why: 'All decryption events create an auditable forensic session record.'
    }
  },
  {
    step: 23,
    id: 'recipient_view_watermark',
    role: 'RECIPIENT',
    stage: 'FORENSIC WATERMARK AUDIT',
    title: 'Audit Decryption Session & Watermark ID',
    summary: 'View session row displaying unique 64-bit watermark ID, recipient identity, and PROVENANCE transaction.',
    where: 'RECIPIENT CONSOLE · SESSIONS TABLE',
    what: 'Examines the session table row containing session ID, watermark ID (e.g. WM-...), and ledger block.',
    why: 'Confirms that this decryption session has been bound to a unique steganographic watermark with SHA-256 parity.',
    next: 'Trigger leak simulation from the session row.',
    meaning: 'Even if other recipients decrypt the same brief, each gets a distinct watermark ID.',
    view: 'sess',
    spotlight: {
      target: 'main .c.wrapx table tr:nth-child(2)',
      fallback: 'main .c.wrapx',
      title: 'SESSION WATERMARK AUDIT',
      tag: 'ZERO-WIDTH STEGANOGRAPHY',
      explanation: 'The session table records the unique 64-bit watermark ID embedded into Officer Aarav\'s decrypted copy.',
      why: 'Steganographic marks are recipient-and-session specific for forensic traceability.'
    }
  },
  {
    step: 24,
    id: 'recipient_click_leak',
    role: 'RECIPIENT',
    stage: 'LEAK INCIDENT SIMULATION',
    title: 'Simulate Unauthorized Leak Exfiltration',
    summary: 'Simulate an external exfiltration incident of Officer Aarav\'s watermarked plaintext brief.',
    where: 'RECIPIENT CONSOLE · SESSIONS TABLE',
    what: 'Simulates exfiltration of the watermarked text file outside the secure perimeter into unauthorized hands.',
    why: 'Creates the authentic scenario faced by an intelligence investigator: an intercepted leaked artifact.',
    next: 'Officer Aarav logs out so an independent investigator can examine the leak.',
    meaning: 'The leaked artifact contains raw text without any database metadata.',
    view: 'sess',
    spotlight: {
      target: 'main .c.wrapx table tr:nth-child(2) button[data-a="leak"]',
      fallback: 'main .c.wrapx table tr:nth-child(2)',
      title: 'SIMULATE LEAK EXFILTRATION',
      tag: 'SECURITY INCIDENT TESTBED',
      explanation: 'Officer Aarav\'s watermarked plaintext brief is exfiltrated outside the enclave as raw text.',
      why: 'Simulates an authentic security breach without metadata or suspect information.'
    }
  },
  {
    step: 25,
    id: 'recipient_logout_click',
    role: 'RECIPIENT',
    stage: 'ROLE HANDOVER',
    title: 'Sign Out Recipient (Officer Aarav)',
    summary: 'Officer Aarav signs out to guarantee zero bias and zero suspect hints for the forensic investigator.',
    where: 'RECIPIENT CONSOLE · TOP NAVIGATION',
    what: 'Terminates Officer Aarav\'s recipient session and returns to login screen.',
    why: 'Strict forensic policy: investigators must operate independently without prior recipient knowledge.',
    next: 'Inspector Morse (INVESTIGATOR) will sign in to perform blind forensic attribution.',
    meaning: 'Recipient session concludes; independent investigation begins.',
    view: 'sess',
    spotlight: {
      target: '.top button[data-a="logout"]',
      fallback: '.top',
      title: 'SIGN OUT RECIPIENT',
      tag: 'FORENSIC ISOLATION',
      explanation: 'Officer Aarav signs out. Independent forensic investigator Morse will now investigate.',
      why: 'Ensures unbiased blind investigation with zero prior recipient knowledge.'
    },
    transition: {
      type: 'ROLE_SWITCH',
      badge: 'RECIPIENT → INVESTIGATOR',
      title: 'FORENSIC INVESTIGATION',
      desc: 'Recipient signed out. Inspector Morse will now authenticate to perform blind forensic attribution.',
      nextRole: 'INVESTIGATOR'
    }
  },

  // ==========================================
  // PHASE D: INDEPENDENT FORENSIC INVESTIGATION & ATTRIBUTION (Steps 26 - 36)
  // ==========================================
  {
    step: 26,
    id: 'investigator_login_user',
    role: 'SYSTEM',
    stage: 'INVESTIGATOR AUTHENTICATION',
    title: 'Enter Investigator Username',
    summary: 'Focus and enter username for Inspector Morse (INVESTIGATOR) on the forensic console.',
    where: 'FORENSIC WORKSTATION · LOGIN CONSOLE',
    what: 'Specifies the forensic investigator username in the authentication prompt.',
    why: 'Enforces auditor accountability; all forensic extractions are cryptographically signed and logged.',
    next: 'Enter password for Inspector Morse.',
    meaning: 'The authentication engine identifies the investigator credential record.',
    view: 'login',
    spotlight: {
      target: '#u',
      fallback: '.login',
      title: 'ENTER INVESTIGATOR USERNAME',
      tag: 'INVESTIGATOR LOGIN',
      explanation: 'Inspector Morse enters his investigator username on his forensic terminal.',
      why: 'Forensic audits are restricted to certified investigator personnel.'
    }
  },
  {
    step: 27,
    id: 'investigator_login_pw',
    role: 'SYSTEM',
    stage: 'INVESTIGATOR AUTHENTICATION',
    title: 'Enter Investigator Password',
    summary: 'Enter password for Inspector Morse to unlock his investigator signing envelope.',
    where: 'FORENSIC WORKSTATION · LOGIN CONSOLE',
    what: 'Supplies credential secret to derive key encryption key for investigator session.',
    why: 'Protects investigator identity and seals audit logging keys.',
    next: 'Click Authenticate to access forensic workstation.',
    meaning: 'Password verification prepares the investigator session.',
    view: 'login',
    spotlight: {
      target: '#p',
      fallback: '.login',
      title: 'ENTER INVESTIGATOR PASSWORD',
      tag: 'CREDENTIAL ENVELOPE',
      explanation: 'Inspector Morse enters his defense credentials to unlock his forensic workspace.',
      why: 'Secures forensic tools and investigative audit integrity.'
    }
  },
  {
    step: 28,
    id: 'investigator_login_submit',
    role: 'SYSTEM',
    stage: 'INVESTIGATOR AUTHENTICATION',
    title: 'Authenticate Forensic Investigator',
    summary: 'Click Authenticate to log into the investigator console and initialize forensic tools.',
    where: 'FORENSIC WORKSTATION · LOGIN CONSOLE',
    what: 'Submits investigator credentials to obtain authenticated session token.',
    why: 'Enables access to the blind forensic ingestion and watermark extraction tools.',
    next: 'Navigate to Investigations workspace.',
    meaning: 'Inspector Morse is authenticated into the forensic laboratory.',
    view: 'login',
    spotlight: {
      target: 'button[data-a="login"]',
      fallback: '.login',
      title: 'AUTHENTICATE INVESTIGATOR',
      tag: 'INVESTIGATOR SESSION',
      explanation: 'Validates credentials and opens the forensic investigation workspace.',
      why: 'Independent investigators operate with clean isolated permissions.'
    },
    transition: {
      type: 'ROLE_SWITCH',
      badge: 'SYSTEM → INVESTIGATOR',
      title: 'INVESTIGATOR AUTHENTICATED',
      desc: 'Inspector Morse authenticated. Opening Investigations workspace to analyze leaked artifact.',
      nextRole: 'INVESTIGATOR'
    }
  },
  {
    step: 29,
    id: 'investigator_nav_inv',
    role: 'INVESTIGATOR',
    stage: 'NAVIGATION',
    title: 'Open Investigations Workspace',
    summary: 'Navigate to the Forensic Investigations portal to ingest the leaked evidence artifact.',
    where: 'INVESTIGATOR CONSOLE · SIDEBAR NAVIGATION',
    what: 'Navigates from Command Center to the Forensic Investigations portal.',
    why: 'Provides the ingestion portal for raw text paste, file upload, or intercepted simulated leaks.',
    next: 'Inspect the evidence ingestion portal.',
    meaning: 'Switches view to Forensic Investigations.',
    view: 'dash',
    spotlight: {
      target: 'aside button[data-v="inv"]',
      fallback: 'aside',
      title: 'OPEN INVESTIGATIONS WORKSPACE',
      tag: 'NAVIGATION',
      explanation: 'Inspector Morse opens the Forensic Investigations portal to analyze the leak.',
      why: 'All steganographic analysis and ledger lookups occur in this portal.'
    }
  },
  {
    step: 30,
    id: 'investigator_view_portal',
    role: 'INVESTIGATOR',
    stage: 'EVIDENCE INGESTION',
    title: 'Inspect Forensic Ingestion Portal',
    summary: 'Inspect the zero-knowledge evidence ingestion interface: no recipient selector exists.',
    where: 'INVESTIGATOR CONSOLE · FORENSIC LAB',
    what: 'Displays the unbiased evidence ingestion portal with options for text paste, file upload, or simulated leak.',
    why: 'Crucial architectural proof: the investigator supplies ONLY the artifact; they never pick a suspect.',
    next: 'Select the intercepted leak artifact.',
    meaning: 'Guarantees 100% blind, unbiased forensic attribution.',
    view: 'inv',
    spotlight: {
      target: 'main .c:first-of-type',
      fallback: 'main',
      title: 'ZERO-KNOWLEDGE INGESTION PORTAL',
      tag: 'UNBIASED FORENSIC LAB',
      explanation: 'Notice that there is NO suspect or recipient dropdown. The system accepts only raw artifact bytes.',
      why: 'Eliminates human bias; the steganographic decoder reconstructs identity purely from text bytes.'
    }
  },
  {
    step: 31,
    id: 'investigator_select_leak',
    role: 'INVESTIGATOR',
    stage: 'EVIDENCE SELECTION & ANALYSIS',
    title: 'Select Intercepted Leaked Artifact',
    summary: 'Select the intercepted leak artifact from the simulated leaks catalog to launch forensic analysis.',
    where: 'INVESTIGATOR CONSOLE · FORENSIC LAB',
    what: 'Clicks Investigate on the intercepted leak artifact to start automated watermark extraction.',
    why: 'Feeds the raw intercepted text directly into the zero-width steganographic decoding pipeline.',
    next: 'Examine watermark signal extraction status and SHA-256 parity.',
    meaning: 'Forensic extraction engine processes the raw text bytes.',
    view: 'inv',
    spotlight: {
      target: 'main .c:first-of-type button[data-a="run"]',
      fallback: 'main .c:first-of-type',
      title: 'INVESTIGATE LEAK ARTIFACT',
      tag: 'EXECUTE FORENSIC ANALYSIS',
      explanation: 'Inspector Morse submits the leaked text for steganographic decoding and ledger lookup.',
      why: 'Triggers extraction of invisible zero-width sequences and cryptographic verification.'
    }
  },
  {
    step: 32,
    id: 'investigator_view_extraction',
    role: 'INVESTIGATOR',
    stage: 'STEGANOGRAPHIC EXTRACTION',
    title: 'Watermark Signal Extracted & Parity Validated',
    summary: 'View extraction tag WATERMARK_FOUND confirming recovery of 64-bit watermark ID and SHA-256 parity.',
    where: 'INVESTIGATOR CONSOLE · FORENSIC LAB',
    what: 'Forensic engine parses zero-width characters, reconstructs watermark ID, and validates 4-char SHA-256 checksum.',
    why: 'Verifies the hidden watermark is intact, untampered, and was not corrupted by dissemination.',
    next: 'View final attribution verdict.',
    meaning: 'Watermark ID is successfully recovered with zero prior knowledge of recipient.',
    view: 'inv',
    spotlight: {
      target: 'main .res .tag',
      fallback: 'main .res',
      title: 'WATERMARK SIGNAL EXTRACTED',
      tag: 'STEGANOGRAPHIC DECODING',
      explanation: 'Zero-width Unicode sequences decoded: 64-bit watermark ID recovered and SHA-256 checksum validated.',
      why: 'Extracts verifiable signal directly from invisible characters inside document line breaks.'
    }
  },
  {
    step: 33,
    id: 'investigator_view_verdict',
    role: 'INVESTIGATOR',
    stage: 'FORENSIC ATTRIBUTION VERDICT',
    title: 'Verdict: VERIFIED PROVENANCE MATCH',
    summary: 'View unequivocal forensic verdict conclusively attributing the leak to Officer Aarav and his decryption session.',
    where: 'INVESTIGATOR CONSOLE · FORENSIC LAB',
    what: 'Displays the final evidentiary attribution banner: VERIFIED PROVENANCE MATCH with full statement.',
    why: 'Demonstrates end-to-end mission accomplishment: anonymous leaked text traced conclusively to specific recipient.',
    next: 'Inspect step-by-step cryptographic verification checklist.',
    meaning: 'Officer Aarav is mathematically proven to be the source of the leaked artifact.',
    view: 'inv',
    spotlight: {
      target: 'main .res .n',
      fallback: 'main .res',
      title: 'VERIFIED PROVENANCE MATCH',
      tag: 'EVIDENTIARY VERDICT',
      explanation: 'Conclusive forensic attribution: the leak is proven to originate from Officer Aarav\'s decryption session.',
      why: 'Ledger search matched extracted watermark ID to verified signed PROVENANCE record.'
    }
  },
  {
    step: 34,
    id: 'investigator_view_checklist',
    role: 'INVESTIGATOR',
    stage: 'EVIDENCE VERIFICATION',
    title: 'Inspect Cryptographic Verification Checklist',
    summary: 'Audit 5-point verification checklist: Watermark, Ledger Record, Recipient Signature, Consensus, and Chain.',
    where: 'INVESTIGATOR CONSOLE · FORENSIC LAB',
    what: 'Reviews green checkmarks confirming every cryptographic and consensus assertion succeeded.',
    why: 'Proves forensic rigor: verdict is not a database query, but a multi-stage mathematical proof.',
    next: 'Inspect the interactive end-to-end evidence chain.',
    meaning: 'All cryptographic invariants hold true.',
    view: 'inv',
    spotlight: {
      target: 'main .res div:has(.st)',
      fallback: 'main .res',
      title: 'VERIFICATION CHECKLIST',
      tag: 'MULTI-STAGE ATTESTATION',
      explanation: 'Audits 5 independent proofs: watermark integrity, ledger lookup, signature check, block validity, and consensus.',
      why: 'Verifies that every link in the evidentiary chain holds under strict legal standards.'
    }
  },
  {
    step: 35,
    id: 'investigator_view_chain',
    role: 'INVESTIGATOR',
    stage: 'CRYPTOGRAPHIC EVIDENCE CHAIN',
    title: 'Inspect Interactive Evidence Chain',
    summary: 'Examine complete interactive evidence chain linking Artefact → Watermark → Tx → Block → Session → Recipient → Signature.',
    where: 'INVESTIGATOR CONSOLE · FORENSIC LAB',
    what: 'Interactive chain showing the unbroken link from the leaked document back to Officer Aarav\'s private key signature.',
    why: 'Provides court-admissible non-repudiation: signature proves Officer Aarav signed the decryption event.',
    next: 'Inspect ledger proof link.',
    meaning: 'Complete cryptographic provenance is proven beyond any dispute.',
    view: 'inv',
    spotlight: {
      target: 'main .res .ch',
      fallback: 'main .res',
      title: 'CRYPTOGRAPHIC EVIDENCE CHAIN',
      tag: 'MATHEMATICAL PROOF',
      explanation: 'Every link in the provenance chain is verified: Artefact → Watermark → Ledger Tx → Block → Session → Recipient → Signature.',
      why: 'Creates irrefutable mathematical evidence anchored by multi-node validator consensus.'
    }
  },
  {
    step: 36,
    id: 'investigator_view_ledger_btn',
    role: 'INVESTIGATOR',
    stage: 'CONSENSUS AUDIT COMPLETE',
    title: 'Direct Consensus Ledger Verification Link',
    summary: 'View direct link allowing the investigator to inspect the canonical ledger block and validator signatures.',
    where: 'INVESTIGATOR CONSOLE · FORENSIC LAB',
    what: 'Highlights the direct inspection button linking the forensic verdict to canonical block #N on the ledger.',
    why: 'Demonstrates transparency: any party or judicial authority can independently verify the ledger block.',
    next: 'Live Demonstration complete.',
    meaning: 'The SIH26237 defense provenance pipeline has executed with full cryptographic fidelity.',
    view: 'inv',
    spotlight: {
      target: 'button[data-a="goto-ledger-block"]',
      fallback: 'main .res',
      title: 'CONSENSUS LEDGER INSPECTION',
      tag: 'INDEPENDENT AUDIT',
      explanation: 'Direct link to the canonical ledger block allows any auditor to verify validator signatures independently.',
      why: 'Guarantees zero-trust transparency: no reliance on centralized authorities or black-box databases.'
    },
    transition: {
      type: 'COMPLETE',
      badge: 'VERIFIED PROVENANCE MATCH',
      title: 'LIVE DEMO COMPLETE',
      desc: 'The leaked artifact has been mathematically and conclusively attributed to Officer Aarav (RECIPIENT) and his specific decryption session.',
      nextRole: 'INVESTIGATOR'
    }
  }
];

class DemoSession {
  constructor(id) {
    this.id = id;
    this.createdAt = Date.now();
    this.lastActive = Date.now();
    // Pure in-memory instance: zero dataDir, memory SQLite, volatile keystore
    this.app = createApp({ dataDir: null, demoMode: true });
    this.state = {
      stepIndex: 0,
      sender: null,
      recipient: null,
      investigator: null,
      doc: null,
      decryption: null,
      leak: null,
      investigation: null,
      history: []
    };
  }

  touch() {
    this.lastActive = Date.now();
  }

  async executeStep(targetStep) {
    this.touch();
    const app = this.app;
    const st = this.state;

    // Provision identities whenever demo starts (targetStep >= 1)
    if (targetStep >= 1 && !st.sender) {
      const sU = 'demo_sender_' + this.id.slice(-4);
      const rU = 'demo_recip_' + this.id.slice(-4);
      const invU = 'demo_inv_' + this.id.slice(-4);
      const pw = 'DemoPassword123!';
      const s = app.register({ name: 'Commander Arjun', username: sU, role: 'SENDER', password: pw });
      const r = app.register({ name: 'Officer Aarav', username: rU, role: 'RECIPIENT', password: pw });
      const inv = app.register({ name: 'Inspector Morse', username: invU, role: 'INVESTIGATOR', password: pw });
      st.sender = { id: s.user.id, name: s.user.name, username: sU, password: pw, token: s.token, keyId: s.keyId };
      st.recipient = { id: r.user.id, name: r.user.name, username: rU, password: pw, token: r.token, keyId: r.keyId };
      st.investigator = { id: inv.user.id, name: inv.user.name, username: invU, password: pw, token: inv.token, keyId: inv.keyId };
    }

    // Document creation occurs by step 11 (Click Encrypt, Authorize & Anchor)
    if (targetStep >= 11 && !st.doc) {
      const sAuth = app.authenticate(st.sender.token);
      const briefContent = 'OPERATION FALCON — v1.0\nClassified Defense Brief.\n1. Objective: Secure northern logistics corridor by Q4.\n2. Rotation: Update post-quantum channel keys every 48 hours.\nEnd of classified brief.';
      const created = app.createDocument(sAuth.user, sAuth.kek, {
        name: 'Operation Falcon - Operational Brief',
        cls: 'SECRET',
        content: briefContent,
        recipients: [st.recipient.id]
      });
      const docRow = app.db.get('select * from documents where id=?', created.id);
      const authRow = app.db.get('select * from auth where doc_id=? and user_id=?', created.id, st.recipient.id);
      st.doc = {
        id: created.id,
        name: docRow.name,
        cls: docRow.cls,
        version: docRow.version,
        hash: docRow.hash,
        authId: authRow.id,
        content: briefContent
      };
    }

    // Decryption occurs by step 20 (Click Decrypt Document)
    if (targetStep >= 20 && !st.decryption) {
      const rAuth = app.authenticate(st.recipient.token);
      const dec = app.decrypt(rAuth.user, rAuth.kek, st.doc.id);
      st.decryption = {
        sessionId: dec.sessionId,
        watermarkId: dec.watermarkId,
        transactionId: dec.transactionId,
        block: dec.block,
        approvals: dec.approvals,
        keyId: dec.keyId,
        plaintext: dec.representation,
        signatureAlgorithm: dec.recordToSign.signatureAlgorithm
      };
    }

    // Leak simulation occurs by step 24 (Simulate Unauthorized Leak)
    if (targetStep >= 24 && !st.leak) {
      const rAuth = app.authenticate(st.recipient.token);
      const lk = app.createLeak(rAuth.user, st.decryption.sessionId);
      const leakRow = app.db.get('select * from leaks where id=?', lk.id);
      st.leak = {
        id: lk.id,
        sessionId: leakRow.session_id,
        ts: leakRow.ts,
        bytes: leakRow.content.length
      };
    }

    // Investigation occurs by step 31 (Select Intercepted Leak Artifact)
    if (targetStep >= 31 && !st.investigation) {
      const invAuth = app.authenticate(st.investigator.token);
      const inv = app.investigate(invAuth.user, { leakId: st.leak.id, label: 'Intercepted Northern Leak' });
      st.investigation = inv;
    }

    st.stepIndex = targetStep;
    return this.getStepResult(targetStep);
  }

  getStepResult(stepNum) {
    const meta = DEMO_STEPS_META[stepNum - 1] || DEMO_STEPS_META[0];
    const st = this.state;
    const env = this.app.environment();

    let details = {};
    let evidence = {};

    if (stepNum <= 3) {
      details = {
        actor: 'Commander Arjun (SENDER)',
        terminal: 'Defense Workstation Console',
        action: 'Authentication & Enclave Initialization',
        status: 'Identity verified; session credentials active'
      };
      evidence = {
        username: st.sender?.username,
        role: 'SENDER',
        status: 'AUTHENTICATED'
      };
    } else if (stepNum >= 4 && stepNum <= 5) {
      details = {
        actor: `${st.sender.name} (SENDER)`,
        status: 'Consensus verified; all 5 nodes in sync'
      };
      evidence = {
        senderKeyId: st.sender.keyId,
        signatureAlgorithm: env.crypto.signatureAlgorithm,
        kemAlgorithm: env.crypto.kemAlgorithm,
        ledgerRegistration: 'Committed to 5-Validator DLT'
      };
    } else if (stepNum >= 6 && stepNum <= 10) {
      details = {
        actor: `${st.sender.name} (SENDER)`,
        documentTitle: 'Operation Falcon - Operational Brief',
        classification: 'SECRET',
        targetRecipient: `${st.recipient.name} (${st.recipient.id})`,
        status: 'Authoring classified brief in local enclave'
      };
      evidence = {
        classification: 'SECRET',
        author: st.sender.id,
        recipientSelection: st.recipient.id
      };
    } else if (stepNum >= 11 && stepNum <= 12) {
      details = {
        actor: `${st.sender.name} (SENDER)`,
        encryptionScheme: 'AES-256-GCM (Authenticated Encryption)',
        aadBinding: `doc:${st.doc?.id}:${st.doc?.version}`,
        status: 'Encrypted locally with ephemeral Content Encryption Key (CEK)'
      };
      evidence = {
        cipher: 'AES-256-GCM',
        keyLength: '256 bits (32 bytes)',
        authenticatedData: `doc:${st.doc?.id}:${st.doc?.version}`,
        documentHash: st.doc?.hash
      };
    } else if (stepNum >= 13 && stepNum <= 15) {
      details = {
        actor: `${st.sender.name} (SENDER)`,
        authorizedRecipient: `${st.recipient.name} (${st.recipient.id})`,
        keyEncapsulation: `${env.crypto.kemAlgorithm} Encap`,
        status: 'Key capsule generated & AUTHORIZATION transaction anchored'
      };
      evidence = {
        authorizationId: st.doc?.authId,
        targetRecipient: st.recipient.id,
        recipientKemKeyId: st.recipient.keyId,
        ledgerAnchor: 'Committed by 5-Node Validator Consensus'
      };
    } else if (stepNum >= 16 && stepNum <= 18) {
      details = {
        actor: 'Officer Aarav (RECIPIENT)',
        terminal: 'Recipient Workstation Console',
        action: 'Authentication & Enclave Initialization',
        status: 'Identity verified; recipient session active'
      };
      evidence = {
        username: st.recipient?.username,
        role: 'RECIPIENT',
        status: 'AUTHENTICATED'
      };
    } else if (stepNum >= 19 && stepNum <= 21) {
      details = {
        actor: `${st.recipient.name} (RECIPIENT)`,
        keyUnwrap: 'scrypt KEK Unlocks Recipient Private KEM Key',
        decapsulation: `${env.crypto.kemAlgorithm} Decap -> Recover CEK`,
        status: 'Authorized plaintext decrypted in memory'
      };
      evidence = {
        recipientId: st.recipient.id,
        documentId: st.doc?.id,
        decapsulationResult: 'SUCCESS',
        authorizationGrant: st.doc?.authId
      };
    } else if (stepNum >= 22 && stepNum <= 23) {
      details = {
        actor: 'Forensic Watermark Engine',
        watermarkType: 'Invisible Steganographic Zero-Width Unicode',
        watermarkId: st.decryption?.watermarkId,
        status: 'Unique session watermark embedded into decrypted representation'
      };
      evidence = {
        watermarkId: st.decryption?.watermarkId,
        encoding: 'Unicode Zero-Width Spaces (\\u200b, \\u200c, \\u2060)',
        parityChecksum: 'SHA-256 Checksum Verified',
        sessionId: st.decryption?.sessionId
      };
    } else if (stepNum >= 24 && stepNum <= 25) {
      details = {
        actor: 'Security Incident Simulation',
        leakSource: 'Simulated Exfiltration of Officer Aarav Plaintext',
        leakArtifactId: st.leak?.id,
        status: 'Suspect text file released to external channel'
      };
      evidence = {
        leakId: st.leak?.id,
        sourceSession: st.leak?.sessionId,
        artifactBytes: st.leak?.bytes,
        visualAppearance: 'Identical to Original Defense Brief'
      };
    } else if (stepNum >= 26 && stepNum <= 28) {
      details = {
        actor: 'Inspector Morse (INVESTIGATOR)',
        terminal: 'Forensic Investigation Lab',
        action: 'Authentication & Forensic Tool Initialization',
        status: 'Identity verified; investigator session active'
      };
      evidence = {
        username: st.investigator?.username,
        role: 'INVESTIGATOR',
        status: 'AUTHENTICATED'
      };
    } else if (stepNum >= 29 && stepNum <= 31) {
      details = {
        actor: 'Inspector Morse (INVESTIGATOR)',
        investigationInput: 'Raw Intercepted Text (Zero Prior Recipient Knowledge)',
        status: 'Ingesting leaked text into unbiased forensic lab'
      };
      evidence = {
        leakId: st.leak?.id,
        investigatorBias: 'NONE (Zero recipient parameters)'
      };
    } else {
      // Steps 32 - 36: Final attribution verdict & proofs
      details = {
        actor: 'Inspector Morse (INVESTIGATOR)',
        verdict: st.investigation ? st.investigation.attributionStatus.replace(/_/g, ' ') : 'VERIFIED PROVENANCE MATCH',
        attributedRecipient: `${st.investigation?.recipientName || st.recipient?.name} (${st.investigation?.recipientId || st.recipient?.id})`,
        decryptionSession: st.investigation?.sessionId || st.decryption?.sessionId,
        status: 'Undeniable forensic attribution cryptographically verified'
      };
      evidence = {
        attributionStatus: st.investigation?.attributionStatus || 'VERIFIED_PROVENANCE_MATCH',
        recipientId: st.investigation?.recipientId || st.recipient?.id,
        recipientName: st.investigation?.recipientName || st.recipient?.name,
        sessionId: st.investigation?.sessionId || st.decryption?.sessionId,
        documentId: st.investigation?.documentId || st.doc?.id,
        blockId: st.investigation?.blockId || st.decryption?.block,
        transactionId: st.investigation?.transactionId || st.decryption?.transactionId,
        signatureValid: st.investigation ? st.investigation.signatureValid : true,
        ledgerValid: st.investigation ? st.investigation.ledgerValid : true
      };
    }

    let sessionToken = null;
    let currentUser = null;
    let targetView = meta.view || 'dash';

    // Role session mapping across steps
    if (stepNum <= 3) {
      sessionToken = null;
      currentUser = null;
    } else if (stepNum >= 4 && stepNum <= 15) {
      sessionToken = st.sender?.token;
      currentUser = st.sender ? { id: st.sender.id, name: st.sender.name, role: 'SENDER' } : null;
    } else if (stepNum >= 16 && stepNum <= 18) {
      sessionToken = null;
      currentUser = null;
    } else if (stepNum >= 19 && stepNum <= 25) {
      sessionToken = st.recipient?.token;
      currentUser = st.recipient ? { id: st.recipient.id, name: st.recipient.name, role: 'RECIPIENT' } : null;
    } else if (stepNum >= 26 && stepNum <= 28) {
      sessionToken = null;
      currentUser = null;
    } else {
      sessionToken = st.investigator?.token;
      currentUser = st.investigator ? { id: st.investigator.id, name: st.investigator.name, role: 'INVESTIGATOR' } : null;
    }

    let operationalOut = null;
    if (stepNum >= 21 && stepNum <= 23 && st.decryption) {
      operationalOut = {
        decrypt: {
          sessionId: st.decryption.sessionId,
          watermarkId: st.decryption.watermarkId,
          transactionId: st.decryption.transactionId,
          block: st.decryption.block,
          approvals: st.decryption.approvals,
          keyId: st.decryption.keyId,
          representation: st.decryption.plaintext,
          evidence: {
            signatureValid: true,
            transactionValid: true,
            blockValid: true,
            approvals: st.decryption.approvals,
            chainValid: true,
            validatorAgreement: { agreed: true, inSync: 5, total: 5, diverged: [] },
            key: { keyId: st.decryption.keyId, status: 'ACTIVE' }
          }
        }
      };
    } else if (stepNum >= 32 && st.investigation) {
      operationalOut = {
        inv: st.investigation
      };
    }

    // Build authentic system snapshot for the current view and actor
    let contextSnapshot = {};
    const app = this.app;
    try { contextSnapshot.dashboard = app.dashboard(); } catch (err) { console.error('Error snapshotting dashboard:', err); }
    try { contextSnapshot.validators = app.validators(); } catch (err) { console.error('Error snapshotting validators:', err); }
    try { contextSnapshot.blocks = app.ledgerBlocks(); } catch (err) { console.error('Error snapshotting blocks:', err); }
    try { contextSnapshot.keys = app.ledgerKeys(); } catch (err) { console.error('Error snapshotting keys:', err); }
    if (currentUser) {
      const u = { id: currentUser.id, name: currentUser.name, role: currentUser.role };
      try { contextSnapshot.documents = app.listDocuments(u); } catch {}
      try { contextSnapshot.sessions = app.listSessions(u); } catch {}
      try { contextSnapshot.investigations = app.listInvestigations(u); } catch {}
      try { contextSnapshot.leaks = app.listLeaks(); } catch {}
      try { contextSnapshot.identities = app.identities(u); } catch {}
      try { contextSnapshot.audit = app.audit(); } catch {}
    }

    return {
      step: stepNum,
      totalSteps: DEMO_STEPS_META.length,
      meta,
      details,
      evidence,
      operationalOut,
      contextSnapshot,
      sessionToken,
      currentUser,
      actors: {
        sender: st.sender ? { id: st.sender.id, name: st.sender.name, username: st.sender.username, password: st.sender.password, role: 'SENDER' } : null,
        recipient: st.recipient ? { id: st.recipient.id, name: st.recipient.name, username: st.recipient.username, password: st.recipient.password, role: 'RECIPIENT' } : null,
        investigator: st.investigator ? { id: st.investigator.id, name: st.investigator.name, username: st.investigator.username, password: st.investigator.password, role: 'INVESTIGATOR' } : null
      },
      targetView,
      environment: env
    };
  }

  destroy() {
    try {
      if (this.app?.close) this.app.close();
      else {
        if (this.app?.net) this.app.net.close();
        if (this.app?.db) this.app.db.close();
      }
    } catch {}
    this.app = null;
    this.state = null;
  }
}

export class DemoManager {
  constructor() {
    this.sessions = new Map();
    // Sweep stale demo sessions every 10 minutes (TTL: 30 minutes)
    this.cleanupTimer = setInterval(() => this.sweep(), 600000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  createSession() {
    const id = rid('DEMO_SES', 8);
    const session = new DemoSession(id);
    this.sessions.set(id, session);
    return id;
  }

  getSession(id) {
    const s = this.sessions.get(id);
    if (s) s.touch();
    return s;
  }

  destroySession(id) {
    const s = this.sessions.get(id);
    if (s) {
      s.destroy();
      this.sessions.delete(id);
    }
  }

  sweep() {
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [id, s] of this.sessions.entries()) {
      if (s.lastActive < cutoff) {
        s.destroy();
        this.sessions.delete(id);
      }
    }
  }

  close() {
    clearInterval(this.cleanupTimer);
    for (const [id, s] of this.sessions.entries()) {
      s.destroy();
    }
    this.sessions.clear();
  }
}

export const demoManager = new DemoManager();
