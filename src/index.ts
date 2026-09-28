/**
 * @infinihash/kyt — TypeScript / JavaScript SDK for the Infinihash KYT API
 * Version: 0.2.2
 *
 * Works in Node.js 18+, Bun, Deno, and any modern browser (fetch required).
 *
 * Quick start
 * -----------
 *   import { Client } from "@infinihash/kyt"; // `KYT` is an identical alias
 *
 *   const client = new Client({ apiKey: "ih_kyt_..." });
 *
 *   // Screen a wallet
 *   const result = await client.screen.address(
 *     "0x722122dF12D4e14e13Ac3b6895a86e84145b6967",
 *     "ethereum"
 *   );
 *   console.log(result.risk_score, result.risk_level);
 *
 *   // Open a case and escalate to SAR workflow
 *   const c = await client.cases.create({ address: result.value });
 *   await client.cases.escalateSar(c.id);
 *
 * Auth
 * ----
 *   Pass { apiKey } to the constructor or set INFINIHASH_KYT_KEY in the environment.
 *   Issue keys at https://kyt.infinihash.com/kyt/admin (X-API-Key header).
 *
 * Errors
 * ------
 *   All non-2xx responses throw KYTError with .status and .body properties.
 */

const DEFAULT_BASE_URL = "https://kyt.infinihash.com";

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

export interface KYTOptions {
  /** Your KYT API key (ih_kyt_...). Falls back to INFINIHASH_KYT_KEY env var. */
  apiKey?: string;
  /** Override base URL for sandbox / staging (default: https://kyt.infinihash.com). */
  baseUrl?: string;
  /** Bring your own fetch implementation (useful for test mocking). */
  fetchImpl?: typeof fetch;
  /** Request timeout in milliseconds (default: 30_000). */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class KYTError extends Error {
  /** HTTP status code (e.g. 401, 429, 500). */
  readonly status: number;
  /** Parsed response body, or undefined if the response had no body. */
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(`HTTP ${status}: ${message}`);
    this.name = "KYTError";
    this.status = status;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type Chain =
  | "ethereum"
  | "bitcoin"
  | "tron"
  | "solana"
  | "polygon"
  | "bnb"
  | "arbitrum"
  | "avalanche"
  | string;

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ScreeningStatus = "pending" | "complete" | "error";
export type SarStage = "none" | "in_progress" | "filed";

export interface RiskFlag {
  type: string;
  description: string;
  severity?: string;
}

export interface ScreenResult {
  id: string;
  status: ScreeningStatus;
  type: string;
  chain: Chain;
  value: string;
  risk_score: number | null;
  risk_level: RiskLevel | null;
  action: string | null;
  entity_name: string | null;
  flags?: { events?: RiskFlag[] };
  narrative?: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AddressFrequency {
  address: string;
  chain: Chain;
  total_screenings: number;
  unique_orgs: number;
  first_seen: string;
  last_seen: string;
}

export interface CaseNote {
  id: string;
  author: string;
  note: string;
  created_at: string;
}

export interface CaseRecord {
  id: string;
  chain: Chain;
  address: string;
  status: string;
  sar_stage: SarStage | null;
  sar_deadline_at: string | null;
  sar_filed_at: string | null;
  notes?: CaseNote[];
  created_at: string;
}

export interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  description?: string;
  created_at: string;
  /** Secret is only returned on creation — store it securely. */
  secret?: string;
}

export interface KeySummary {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface CreateKeyResponse extends KeySummary {
  /** Full key value — shown only once. Store securely. */
  key: string;
}

export interface KeyUsage {
  period_start: string;
  period_end: string;
  screenings_used: number;
  screenings_limit: number | null;
  plan: string;
}

export interface WalletRisk {
  address: string;
  chain: Chain;
  risk_score: number;
  risk_level: RiskLevel;
  entity_name: string | null;
  cluster_size: number | null;
  exposure: Record<string, number>;
  updated_at: string;
}

export interface WalletReport {
  address: string;
  chain: Chain;
  inbound_volume_usd: number | null;
  outbound_volume_usd: number | null;
  counterparty_categories: Record<string, number>;
  flagged_transactions: Array<{
    tx_hash: string;
    direction: "in" | "out";
    amount_usd: number | null;
    counterparty: string | null;
    risk_level: RiskLevel;
    flags: string[];
  }>;
  generated_at: string;
}

export interface BulkJob {
  job_id: string;
  poll_url: string;
  submitted_at: string;
}

export interface BulkStatus {
  job_id: string;
  status: "queued" | "processing" | "complete" | "error";
  total: number;
  processed: number;
  completed_at: string | null;
}

export interface TravelRuleCheck {
  travel_rule_required: boolean;
  originator_vasp: VaspInfo | null;
  beneficiary_vasp: VaspInfo | null;
  threshold_usd: number;
  recommended_action: string;
}

export interface VaspInfo {
  name: string;
  type: string;
  jurisdiction: string;
  regulated: boolean;
}

export interface IntelStats {
  total_labels: number;
  chains: Record<string, number>;
  last_updated: string;
}

export interface IntelLookup {
  address: string;
  labels: Array<{
    label: string;
    category: string;
    chain: Chain;
    confidence: number;
    source: string;
  }>;
  risk_signals: string[];
  last_seen: string | null;
}

// ---------------------------------------------------------------------------
// Main client class
// ---------------------------------------------------------------------------

export class KYT {
  readonly baseUrl: string;

  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: KYTOptions = {}) {
    const key =
      opts.apiKey ??
      (typeof process !== "undefined" ? process.env?.INFINIHASH_KYT_KEY : undefined);
    if (!key) {
      throw new Error(
        "Missing API key. Pass { apiKey } or set INFINIHASH_KYT_KEY."
      );
    }
    this.apiKey = key;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  // ── Internal request helper ─────────────────────────────────────────────

  private async req<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).map(([k, v]) => [k, String(v)])
        )
      );
      url += `?${qs}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "infinihash-kyt-ts/0.2.2",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let bodyOut: unknown;
        try {
          bodyOut = await res.json();
        } catch {
          bodyOut = await res.text();
        }
        const msg =
          bodyOut &&
          typeof bodyOut === "object" &&
          "detail" in (bodyOut as Record<string, unknown>)
            ? (bodyOut as { detail?: string }).detail
            : undefined;
        throw new KYTError(res.status, msg ?? res.statusText ?? "Request failed", bodyOut);
      }

      if (res.status === 204 || res.status === 202) return undefined as unknown as T;
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Screen ────────────────────────────────────────────────────────────────

  /**
   * Wallet and address screening.
   *
   * Screenings are asynchronous — the initial call returns with status="pending".
   * Poll `screen.get(id)` until status="complete" (typically < 2s for cached addresses).
   */
  screen = {
    /**
     * Screen a wallet address for sanctions, mixer exposure, and risk signals.
     *
     * @param address  On-chain address (checksummed ETH or native format for other chains).
     * @param chain    Blockchain identifier (default: "ethereum").
     */
    address: (address: string, chain: Chain = "ethereum") =>
      this.req<ScreenResult>("POST", "/api/v1/screen", {
        type: "wallet",
        value: address,
        chain,
      }),

    /**
     * Fetch a screening by ID. Poll until status === "complete".
     */
    get: (screeningId: string) =>
      this.req<ScreenResult>("GET", `/api/v1/screen/${screeningId}`),

    /**
     * Return how many times an address has been queried across all tenants.
     * High frequency is itself a risk signal for known bad actors.
     */
    addressFrequency: (address: string, chain: Chain = "ethereum") =>
      this.req<AddressFrequency>(
        "GET",
        `/api/v1/screen/address/${address}/frequency`,
        undefined,
        { chain }
      ),

    /**
     * Re-generate the AI compliance narrative for a completed screening.
     * Use after new intelligence has been ingested to refresh the narrative.
     */
    regenerateNarrative: (screeningId: string) =>
      this.req<ScreenResult>("POST", `/api/v1/screen/${screeningId}/narrative`),
  };

  // ── Cases ─────────────────────────────────────────────────────────────────

  /**
   * Compliance case management and SAR workflow.
   *
   * Cases track high-risk addresses through your internal review process and
   * produce FinCEN-ready SAR drafts automatically.
   */
  cases = {
    /**
     * Open a new compliance case for an address.
     *
     * @param params.address  Wallet address to investigate.
     * @param params.chain    Chain the address belongs to (default: "ethereum").
     * @param params.notes    Initial notes (can be added later via addNote).
     */
    create: (params: { address: string; chain?: Chain; notes?: string }) =>
      this.req<CaseRecord>("POST", "/api/v1/cases", {
        chain: params.chain ?? "ethereum",
        address: params.address,
        notes: params.notes ?? "",
      }),

    /** List all cases for your organisation (newest first). */
    list: () => this.req<CaseRecord[]>("GET", "/api/v1/cases"),

    /** Fetch a single case with full note history and SAR stage. */
    get: (caseId: string) => this.req<CaseRecord>("GET", `/api/v1/cases/${caseId}`),

    /**
     * Append an investigator note to a case.
     *
     * @param caseId  UUID of the case.
     * @param note    Note body text.
     * @param author  Display name of the analyst (default: "sdk").
     */
    addNote: (caseId: string, note: string, author = "sdk") =>
      this.req<CaseNote>("POST", `/api/v1/cases/${caseId}/notes`, { note, author }),

    /**
     * Escalate a case into the SAR filing workflow.
     *
     * Sets sar_stage to "in_progress" and records the filing deadline.
     * A draft SAR PDF is generated automatically.
     *
     * @param caseId        UUID of the case.
     * @param deadlineDays  Days until SAR must be filed (default: 30, per FinCEN rules).
     */
    escalateSar: (caseId: string, deadlineDays = 30) =>
      this.req<CaseRecord>("PATCH", `/api/v1/cases/${caseId}/escalate-sar`, {
        deadline_days: deadlineDays,
      }),

    /**
     * Mark a SAR as filed with FinCEN. Closes the SAR workflow for this case.
     *
     * @param caseId  UUID of the case.
     * @param bsaId   BSA ID assigned by FinCEN after filing (recommended).
     */
    markSarFiled: (caseId: string, bsaId = "") =>
      this.req<CaseRecord>("PATCH", `/api/v1/cases/${caseId}/mark-sar-filed`, {
        bsa_id: bsaId,
      }),

    /**
     * Download the SAR draft as a PDF (ArrayBuffer).
     *
     * Save to disk in Node.js:
     *   const buf = await client.cases.sarPdf(caseId);
     *   fs.writeFileSync("sar.pdf", Buffer.from(buf));
     */
    sarPdf: async (caseId: string): Promise<ArrayBuffer> => {
      const res = await this.fetchImpl(`${this.baseUrl}/api/v1/cases/${caseId}/sar`, {
        headers: { "X-API-Key": this.apiKey },
      });
      if (!res.ok) throw new KYTError(res.status, res.statusText);
      return res.arrayBuffer();
    },

    /**
     * Export a read-only FinCEN-structured JSON draft.
     *
     * Maps to FinCEN SAR form fields. Your compliance team must add subject
     * personal information before filing — the API never stores PII.
     */
    sarExportFinCEN: (caseId: string) =>
      this.req<Record<string, unknown>>("GET", `/api/v1/cases/${caseId}/sar/export`),

    /** Alternate FinCEN export route. */
    exportFinCEN: (caseId: string) =>
      this.req<Record<string, unknown>>("GET", `/api/v1/cases/${caseId}/export/fincen`),
  };

  // ── Webhooks ──────────────────────────────────────────────────────────────

  /**
   * Webhook endpoint management.
   *
   * Webhooks deliver real-time push notifications when screening events occur.
   * Payloads are signed with HMAC-SHA256 — verify the X-KYT-Signature header.
   */
  webhooks = {
    /** Return the list of supported event types. */
    listEvents: () => this.req<string[]>("GET", "/api/v1/webhooks/events"),

    /** List all webhook endpoints for your organisation. */
    list: () => this.req<WebhookRecord[]>("GET", "/api/v1/webhooks"),

    /**
     * Register a new webhook endpoint.
     *
     * @param url          HTTPS URL that will receive POST payloads.
     * @param events       Event types to subscribe to (default: ["high_risk_screening"]).
     * @param description  Human label for the webhook.
     *
     * Returns the webhook object including `secret` (shown once — store securely).
     */
    create: (
      url: string,
      events: string[] = ["high_risk_screening"],
      description = ""
    ) =>
      this.req<WebhookRecord>("POST", "/api/v1/webhooks", {
        url,
        events,
        description,
      }),

    /**
     * Update an existing webhook (partial update).
     *
     * @param webhookId  UUID of the webhook.
     * @param patch      Fields to update (url, events, active).
     */
    update: (
      webhookId: string,
      patch: { url?: string; events?: string[]; active?: boolean }
    ) => this.req<WebhookRecord>("PATCH", `/api/v1/webhooks/${webhookId}`, patch),

    /** Delete a webhook endpoint. */
    delete: (webhookId: string) =>
      this.req<void>("DELETE", `/api/v1/webhooks/${webhookId}`),

    /** Send a test payload to a webhook (HTTP 202 on success). */
    test: (webhookId: string) =>
      this.req<void>("POST", `/api/v1/webhooks/${webhookId}/test`),
  };

  // ── Keys ─────────────────────────────────────────────────────────────────

  /**
   * API key management for your organisation.
   *
   * Only your first key (issued via the dashboard) can manage other keys.
   */
  keys = {
    /** List all active API keys (secrets are redacted). */
    list: () => this.req<KeySummary[]>("GET", "/api/v1/keys"),

    /**
     * Issue a new API key.
     *
     * @param name  Human label (e.g. "production-server", "ci-pipeline").
     * Returns the full key value — shown only once.
     */
    create: (name: string) =>
      this.req<CreateKeyResponse>("POST", "/api/v1/keys", { name }),

    /** Permanently revoke an API key. */
    revoke: (keyId: string) => this.req<void>("DELETE", `/api/v1/keys/${keyId}`),

    /** Return screening usage and quota for the current billing period. */
    usage: () => this.req<KeyUsage>("GET", "/api/v1/keys/usage"),
  };

  // ── Wallet ────────────────────────────────────────────────────────────────

  /**
   * Detailed wallet intelligence beyond a point-in-time screening.
   */
  wallet = {
    /**
     * Return the aggregated risk profile for a wallet address.
     *
     * Combines all historical screenings, entity labels, and cluster data
     * into a single risk summary with exposure breakdown by category.
     */
    risk: (address: string, chain: Chain = "ethereum") =>
      this.req<WalletRisk>("GET", `/api/v1/wallet/${address}/risk`, undefined, {
        chain,
      }),

    /**
     * Return a detailed transaction-flow report for a wallet.
     *
     * Includes inbound/outbound volume, counterparty categories, and a list
     * of flagged transactions.
     */
    report: (address: string, chain: Chain = "ethereum") =>
      this.req<WalletReport>("GET", `/api/v1/wallet/${address}/report`, undefined, {
        chain,
      }),
  };

  // ── Bulk ─────────────────────────────────────────────────────────────────

  /**
   * Batch-screen multiple addresses in a single API call.
   *
   * Results are processed asynchronously. Poll `bulk.status()` until complete,
   * then fetch results with `bulk.export(jobId)`.
   */
  bulk = {
    /**
     * Submit a batch screening job.
     *
     * @param addresses  Array of { address, chain } objects.
     *                   Example: [{ address: "0xABC...", chain: "ethereum" }]
     */
    screen: (addresses: Array<{ address: string; chain: Chain }>) =>
      this.req<BulkJob>("POST", "/api/v1/bulk", { addresses }),

    /** Return the status of the most recent bulk job for your organisation. */
    status: () => this.req<BulkStatus>("GET", "/api/v1/bulk/status"),

    /**
     * Download results for a completed bulk job.
     *
     * @param jobId  UUID returned by bulk.screen().
     */
    export: (jobId: string) =>
      this.req<{ results: ScreenResult[]; summary: Record<string, number> }>(
        "GET",
        `/api/v1/bulk/export/${jobId}`
      ),
  };

  // ── Travel Rule ───────────────────────────────────────────────────────────

  /**
   * FATF Travel Rule compliance checks.
   *
   * Determine whether counterparty addresses belong to regulated VASPs
   * and whether travel rule information must be shared.
   */
  travelRule = {
    /**
     * Perform a Travel Rule compliance check for a proposed transfer.
     *
     * @param originator   Sending wallet address.
     * @param beneficiary  Receiving wallet address.
     * @param amountUsd    Transfer value in USD equivalent.
     * @param chain        Blockchain identifier.
     */
    check: (
      originator: string,
      beneficiary: string,
      amountUsd: number,
      chain: Chain = "ethereum"
    ) =>
      this.req<TravelRuleCheck>("POST", "/api/v1/travel-rule/check", {
        originator,
        beneficiary,
        amount_usd: amountUsd,
        chain,
      }),

    /**
     * Identify whether an address belongs to a known VASP.
     *
     * @param address  On-chain address to look up.
     * @param chain    Blockchain identifier.
     */
    identifyVasp: (address: string, chain: Chain = "ethereum") =>
      this.req<VaspInfo>("GET", `/api/v1/travel-rule/vasp/${address}`, undefined, {
        chain,
      }),
  };

  // ── Intelligence ──────────────────────────────────────────────────────────

  /**
   * Intelligence database lookups.
   *
   * Query the Infinihash label graph directly for building dashboards or
   * enriching your own risk models.
   */
  intel = {
    /**
     * Return aggregate statistics on the intelligence database.
     * Includes total label count, chain breakdown, and data freshness.
     */
    stats: () => this.req<IntelStats>("GET", "/api/v1/stats"),

    /**
     * Cross-chain address lookup across the full intelligence graph.
     *
     * Returns all labels, entity associations, and risk signals for the
     * address across every chain in the database.
     *
     * @param address  Address (chain prefix optional, e.g. "eth:0xABC...").
     */
    lookup: (address: string) =>
      this.req<IntelLookup>("GET", `/api/v1/intel/lookup/${address}`),

    /** Return the last 50 screenings for your organisation. */
    recentScreenings: () =>
      this.req<ScreenResult[]>("GET", "/api/v1/intel/recent-screenings"),
  };

  // ── Monitor (legacy) ──────────────────────────────────────────────────────

  /**
   * Simple monitoring subscriptions (legacy endpoint).
   * Prefer the `webhooks` namespace for new integrations.
   */
  monitor = {
    register: (webhookUrl: string, events: string[] = ["high_risk_screening"]) =>
      this.req("POST", "/api/v1/monitor", { webhook_url: webhookUrl, events }),
    delete: (monitorId: string) =>
      this.req("DELETE", `/api/v1/monitor/${monitorId}`),
  };

  // ── Utility ───────────────────────────────────────────────────────────────

  /** Check API liveness. Returns { status: "ok" } when healthy. */
  health = () => this.req<{ status: string }>("GET", "/api/v1/health");
}

/**
 * `Client` is the name used throughout the docs quickstarts; `KYT` is the
 * original name. Both refer to the same class (value and type).
 */
export const Client = KYT;
export type Client = KYT;

export default KYT;
