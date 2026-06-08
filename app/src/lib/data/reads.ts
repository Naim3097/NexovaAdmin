/**
 * Per-request de-duplicated reads.
 *
 * These list functions are fetched by more than one thing in a single render
 * (e.g. the dashboard fetches them directly AND the activity feed re-derives
 * from the same data). Wrapping them in React `cache()` collapses those into a
 * single Supabase round-trip per request. Live data — `cache()` only dedupes
 * within one render, it does NOT serve stale data across requests.
 *
 * Import the list from here (instead of the individual adapter) anywhere a
 * page and a shared helper both need the same collection in one render.
 */
import { cache } from "react";
import { listLeads as _listLeads } from "@/lib/data/leads";
import { listProjects as _listProjects } from "@/lib/data/projects";
import { listInvoices as _listInvoices } from "@/lib/data/invoices";
import { listContentPosts as _listContentPosts } from "@/lib/data/content";
import { listCampaigns as _listCampaigns } from "@/lib/data/campaigns";
import { listSubmissions as _listSubmissions } from "@/lib/data/onboarding";

export const listLeads = cache(_listLeads);
export const listProjects = cache(_listProjects);
export const listInvoices = cache(_listInvoices);
export const listContentPosts = cache(_listContentPosts);
export const listCampaigns = cache(_listCampaigns);
export const listSubmissions = cache(_listSubmissions);
