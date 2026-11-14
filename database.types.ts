// Generated from the live SCMS-Development Supabase schema.
// Regenerate after schema changes; this file is not a SQL migration or schema baseline.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      approval_decisions: {
        Row: {
          approval_request_step_id: string
          approver_profile_id: string
          comments: string | null
          decided_at: string
          decision: string
          id: string
        }
        Insert: {
          approval_request_step_id: string
          approver_profile_id: string
          comments?: string | null
          decided_at?: string
          decision: string
          id?: string
        }
        Update: {
          approval_request_step_id?: string
          approver_profile_id?: string
          comments?: string | null
          decided_at?: string
          decision?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_approval_request_step_id_fkey"
            columns: ["approval_request_step_id"]
            isOneToOne: false
            referencedRelation: "approval_request_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_decisions_approver_profile_id_fkey"
            columns: ["approver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_policies: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by_profile_id: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          name: string
          transaction_type: string
          version: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name: string
          transaction_type: string
          version: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name?: string
          transaction_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_policies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_policies_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_policy_bands: {
        Row: {
          created_at: string
          id: string
          max_amount_base: number | null
          min_amount_base: number
          policy_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_amount_base?: number | null
          min_amount_base?: number
          policy_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_amount_base?: number | null
          min_amount_base?: number
          policy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_policy_bands_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "approval_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_policy_steps: {
        Row: {
          band_id: string
          created_at: string
          id: string
          prohibit_submitter_approval: boolean
          required_approvals: number
          required_permission_key: string
          step_number: number
        }
        Insert: {
          band_id: string
          created_at?: string
          id?: string
          prohibit_submitter_approval?: boolean
          required_approvals?: number
          required_permission_key: string
          step_number: number
        }
        Update: {
          band_id?: string
          created_at?: string
          id?: string
          prohibit_submitter_approval?: boolean
          required_approvals?: number
          required_permission_key?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_policy_steps_band_id_fkey"
            columns: ["band_id"]
            isOneToOne: false
            referencedRelation: "approval_policy_bands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_policy_steps_required_permission_key_fkey"
            columns: ["required_permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      approval_request_steps: {
        Row: {
          approval_request_id: string
          created_at: string
          id: string
          prohibit_submitter_approval: boolean
          required_approvals: number
          required_permission_key: string
          status: string
          step_number: number
        }
        Insert: {
          approval_request_id: string
          created_at?: string
          id?: string
          prohibit_submitter_approval?: boolean
          required_approvals: number
          required_permission_key: string
          status?: string
          step_number: number
        }
        Update: {
          approval_request_id?: string
          created_at?: string
          id?: string
          prohibit_submitter_approval?: boolean
          required_approvals?: number
          required_permission_key?: string
          status?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_request_steps_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_request_steps_required_permission_key_fkey"
            columns: ["required_permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      approval_requests: {
        Row: {
          amount_base: number
          band_id: string | null
          branch_id: string | null
          completed_at: string | null
          id: string
          policy_id: string | null
          policy_snapshot: Json
          policy_version: number | null
          status: string
          submitted_at: string
          submitted_by_profile_id: string
          target_id: string
          transaction_type: string
        }
        Insert: {
          amount_base: number
          band_id?: string | null
          branch_id?: string | null
          completed_at?: string | null
          id?: string
          policy_id?: string | null
          policy_snapshot?: Json
          policy_version?: number | null
          status?: string
          submitted_at?: string
          submitted_by_profile_id: string
          target_id: string
          transaction_type: string
        }
        Update: {
          amount_base?: number
          band_id?: string | null
          branch_id?: string | null
          completed_at?: string | null
          id?: string
          policy_id?: string | null
          policy_snapshot?: Json
          policy_version?: number | null
          status?: string
          submitted_at?: string
          submitted_by_profile_id?: string
          target_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_band_id_fkey"
            columns: ["band_id"]
            isOneToOne: false
            referencedRelation: "approval_policy_bands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "approval_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_submitted_by_profile_id_fkey"
            columns: ["submitted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_status: string
          check_in_time: string | null
          created_at: string
          id: string
          member_id: string
          notes: string | null
          recorded_by_profile_id: string | null
          session_id: string
        }
        Insert: {
          attendance_status: string
          check_in_time?: string | null
          created_at?: string
          id?: string
          member_id: string
          notes?: string | null
          recorded_by_profile_id?: string | null
          session_id: string
        }
        Update: {
          attendance_status?: string
          check_in_time?: string | null
          created_at?: string
          id?: string
          member_id?: string
          notes?: string | null
          recorded_by_profile_id?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_recorded_by_profile_id_fkey"
            columns: ["recorded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          branch_id: string
          created_at: string
          created_by_profile_id: string | null
          event_id: string | null
          id: string
          session_date: string
          session_type: string
          title: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by_profile_id?: string | null
          event_id?: string | null
          id?: string
          session_date?: string
          session_type?: string
          title: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by_profile_id?: string | null
          event_id?: string | null
          id?: string
          session_date?: string
          session_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_profile_id: string | null
          branch_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          branch_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          branch_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          account_id: string | null
          allocated_amount: number
          budget_id: string
          created_at: string
          description: string | null
          fund_id: string | null
          id: string
        }
        Insert: {
          account_id?: string | null
          allocated_amount: number
          budget_id: string
          created_at?: string
          description?: string | null
          fund_id?: string | null
          id?: string
        }
        Update: {
          account_id?: string | null
          allocated_amount?: number
          budget_id?: string
          created_at?: string
          description?: string | null
          fund_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_lines_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          approval_request_id: string | null
          approved_at: string | null
          approved_by_profile_id: string | null
          base_currency_code: string
          branch_id: string | null
          budget_type: string
          created_at: string
          currency_code: string
          event_id: string | null
          exchange_rate_to_base: number
          id: string
          name: string
          period_id: string
          status: string
          submitted_by_profile_id: string | null
          updated_at: string
        }
        Insert: {
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by_profile_id?: string | null
          base_currency_code?: string
          branch_id?: string | null
          budget_type: string
          created_at?: string
          currency_code: string
          event_id?: string | null
          exchange_rate_to_base?: number
          id?: string
          name: string
          period_id: string
          status?: string
          submitted_by_profile_id?: string | null
          updated_at?: string
        }
        Update: {
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by_profile_id?: string | null
          base_currency_code?: string
          branch_id?: string | null
          budget_type?: string
          created_at?: string
          currency_code?: string
          event_id?: string | null
          exchange_rate_to_base?: number
          id?: string
          name?: string
          period_id?: string
          status?: string
          submitted_by_profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_base_currency_code_fkey"
            columns: ["base_currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "budgets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "budgets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_submitted_by_profile_id_fkey"
            columns: ["submitted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cell_members: {
        Row: {
          branch_id: string
          cell_id: string
          created_at: string
          id: string
          joined_at: string
          member_id: string
          role: string
          status: string
        }
        Insert: {
          branch_id: string
          cell_id: string
          created_at?: string
          id?: string
          joined_at?: string
          member_id: string
          role?: string
          status?: string
        }
        Update: {
          branch_id?: string
          cell_id?: string
          created_at?: string
          id?: string
          joined_at?: string
          member_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_cell_members_cell_same_branch"
            columns: ["cell_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["id", "branch_id"]
          },
          {
            foreignKeyName: "fk_cell_members_profile_same_branch"
            columns: ["member_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "branch_id"]
          },
        ]
      }
      cells: {
        Row: {
          branch_id: string
          created_at: string
          description: string | null
          id: string
          leader_id: string | null
          location: string | null
          meeting_day: string | null
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          location?: string | null
          meeting_day?: string | null
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          location?: string | null
          meeting_day?: string | null
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cells_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cells_leader_same_branch"
            columns: ["leader_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "branch_id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_control_account: boolean
          is_system: boolean
          name: string
          normal_balance: string
          parent_account_id: string | null
        }
        Insert: {
          account_type: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_control_account?: boolean
          is_system?: boolean
          name: string
          normal_balance: string
          parent_account_id?: string | null
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_control_account?: boolean
          is_system?: boolean
          name?: string
          normal_balance?: string
          parent_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      church_branches: {
        Row: {
          address: string | null
          city: string | null
          code: string
          country: string
          created_at: string
          district_id: string | null
          email: string | null
          id: string
          is_main_branch: boolean
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          state_or_region: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          country?: string
          created_at?: string
          district_id?: string | null
          email?: string | null
          id?: string
          is_main_branch?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          state_or_region?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          country?: string
          created_at?: string
          district_id?: string | null
          email?: string | null
          id?: string
          is_main_branch?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          state_or_region?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_branches_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      church_resources: {
        Row: {
          branch_id: string | null
          category: string | null
          created_at: string
          created_by_profile_id: string | null
          description: string | null
          id: string
          resource_type: string
          resource_url: string
          status: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          id?: string
          resource_type: string
          resource_url: string
          status?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          id?: string
          resource_type?: string
          resource_url?: string
          status?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_resources_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_resources_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      church_settings: {
        Row: {
          address: string | null
          base_currency_code: string
          church_name: string
          city: string | null
          country: string
          created_at: string
          email: string | null
          id: number
          logo_url: string | null
          mission: string | null
          phone: string | null
          primary_color: string | null
          secondary_color: string | null
          senior_pastor_name: string | null
          service_times: Json
          subtitle: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          base_currency_code?: string
          church_name: string
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: number
          logo_url?: string | null
          mission?: string | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          senior_pastor_name?: string | null
          service_times?: Json
          subtitle?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          base_currency_code?: string
          church_name?: string
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: number
          logo_url?: string | null
          mission?: string | null
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          senior_pastor_name?: string | null
          service_times?: Json
          subtitle?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_settings_base_currency_code_fkey"
            columns: ["base_currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          minor_units: number
          name: string
          symbol: string | null
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          minor_units?: number
          name: string
          symbol?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          minor_units?: number
          name?: string
          symbol?: string | null
        }
        Relationships: []
      }
      districts: {
        Row: {
          country: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          region: string | null
          status: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          region?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          region?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_registrations: {
        Row: {
          checked_in_at: string | null
          email: string | null
          event_id: string
          id: string
          member_id: string | null
          member_name: string | null
          phone: string | null
          registered_at: string
          registered_by_profile_id: string | null
          status: string
        }
        Insert: {
          checked_in_at?: string | null
          email?: string | null
          event_id: string
          id?: string
          member_id?: string | null
          member_name?: string | null
          phone?: string | null
          registered_at?: string
          registered_by_profile_id?: string | null
          status?: string
        }
        Update: {
          checked_in_at?: string | null
          email?: string | null
          event_id?: string
          id?: string
          member_id?: string | null
          member_name?: string | null
          phone?: string | null
          registered_at?: string
          registered_by_profile_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_registered_by_profile_id_fkey"
            columns: ["registered_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_survey_answers: {
        Row: {
          answer_value: Json
          created_at: string
          id: string
          question_id: string
          response_id: string
          survey_id: string
        }
        Insert: {
          answer_value: Json
          created_at?: string
          id?: string
          question_id: string
          response_id: string
          survey_id: string
        }
        Update: {
          answer_value?: Json
          created_at?: string
          id?: string
          question_id?: string
          response_id?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_survey_answer_question_same_survey"
            columns: ["question_id", "survey_id"]
            isOneToOne: false
            referencedRelation: "event_survey_questions"
            referencedColumns: ["id", "survey_id"]
          },
          {
            foreignKeyName: "fk_survey_answer_response_same_survey"
            columns: ["response_id", "survey_id"]
            isOneToOne: false
            referencedRelation: "event_survey_responses"
            referencedColumns: ["id", "survey_id"]
          },
        ]
      }
      event_survey_questions: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          options: Json
          question_text: string
          question_type: string
          sort_order: number
          survey_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          options?: Json
          question_text: string
          question_type: string
          sort_order?: number
          survey_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          options?: Json
          question_text?: string
          question_type?: string
          sort_order?: number
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "event_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      event_survey_responses: {
        Row: {
          id: string
          member_id: string
          submitted_at: string
          survey_id: string
        }
        Insert: {
          id?: string
          member_id: string
          submitted_at?: string
          survey_id: string
        }
        Update: {
          id?: string
          member_id?: string
          submitted_at?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_survey_responses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "event_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      event_surveys: {
        Row: {
          closes_at: string | null
          created_at: string
          created_by_profile_id: string | null
          description: string | null
          event_id: string
          id: string
          opens_at: string | null
          respondent_scope: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          event_id: string
          id?: string
          opens_at?: string | null
          respondent_scope?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          event_id?: string
          id?: string
          opens_at?: string | null
          respondent_scope?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_surveys_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_surveys_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          branch_id: string | null
          category: string | null
          created_at: string
          created_by_profile_id: string | null
          description: string | null
          end_time: string
          featured_image: string | null
          id: string
          is_virtual: boolean
          location: string | null
          max_attendees: number | null
          organizer_name: string | null
          registration_required: boolean
          start_time: string
          status: string
          target_audience: string | null
          title: string
          updated_at: string
          virtual_link: string | null
        }
        Insert: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          end_time: string
          featured_image?: string | null
          id?: string
          is_virtual?: boolean
          location?: string | null
          max_attendees?: number | null
          organizer_name?: string | null
          registration_required?: boolean
          start_time: string
          status?: string
          target_audience?: string | null
          title: string
          updated_at?: string
          virtual_link?: string | null
        }
        Update: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          end_time?: string
          featured_image?: string | null
          id?: string
          is_virtual?: boolean
          location?: string | null
          max_attendees?: number | null
          organizer_name?: string | null
          registration_required?: boolean
          start_time?: string
          status?: string
          target_audience?: string | null
          title?: string
          updated_at?: string
          virtual_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          account_reference: string | null
          account_type: string
          branch_id: string | null
          chart_account_id: string
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          name: string
          provider_name: string | null
        }
        Insert: {
          account_reference?: string | null
          account_type: string
          branch_id?: string | null
          chart_account_id: string
          created_at?: string
          currency_code: string
          id?: string
          is_active?: boolean
          name: string
          provider_name?: string | null
        }
        Update: {
          account_reference?: string | null
          account_type?: string
          branch_id?: string | null
          chart_account_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name?: string
          provider_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_accounts_chart_account_id_fkey"
            columns: ["chart_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      financial_documents: {
        Row: {
          amount: number
          approval_request_id: string | null
          approved_at: string | null
          approved_by_profile_id: string | null
          base_currency_code: string
          branch_id: string | null
          created_at: string
          created_by_profile_id: string | null
          currency_code: string
          description: string | null
          document_number: number
          document_type: string
          exchange_rate_to_base: number
          external_reference: string | null
          financial_account_id: string | null
          id: string
          journal_entry_id: string | null
          payee_or_payer_name: string
          payment_method: string
          profile_id: string | null
          status: string
          transaction_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by_profile_id?: string | null
          base_currency_code?: string
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          currency_code: string
          description?: string | null
          document_number?: never
          document_type: string
          exchange_rate_to_base?: number
          external_reference?: string | null
          financial_account_id?: string | null
          id?: string
          journal_entry_id?: string | null
          payee_or_payer_name: string
          payment_method: string
          profile_id?: string | null
          status?: string
          transaction_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by_profile_id?: string | null
          base_currency_code?: string
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          currency_code?: string
          description?: string | null
          document_number?: never
          document_type?: string
          exchange_rate_to_base?: number
          external_reference?: string | null
          financial_account_id?: string | null
          id?: string
          journal_entry_id?: string | null
          payee_or_payer_name?: string
          payment_method?: string
          profile_id?: string | null
          status?: string
          transaction_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_documents_approval_request_fk"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_base_currency_code_fkey"
            columns: ["base_currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "financial_documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "financial_documents_financial_account_id_fkey"
            columns: ["financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: true
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          closed_at: string | null
          closed_by_profile_id: string | null
          created_at: string
          end_date: string
          financial_year_id: string
          id: string
          name: string
          start_date: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by_profile_id?: string | null
          created_at?: string
          end_date: string
          financial_year_id: string
          id?: string
          name: string
          start_date: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by_profile_id?: string | null
          created_at?: string
          end_date?: string
          financial_year_id?: string
          id?: string
          name?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_periods_closed_by_profile_id_fkey"
            columns: ["closed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_periods_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          start_date: string
          status: string
          year_number: number
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          start_date: string
          status?: string
          year_number: number
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          start_date?: string
          status?: string
          year_number?: number
        }
        Relationships: []
      }
      funds: {
        Row: {
          code: string
          created_at: string
          description: string | null
          fund_type: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          fund_type?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          fund_type?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      giving_records: {
        Row: {
          campaign_or_appeal: string | null
          created_at: string
          financial_document_id: string
          fund_id: string | null
          giver_name: string
          giver_profile_id: string | null
          giving_type: string
          id: string
        }
        Insert: {
          campaign_or_appeal?: string | null
          created_at?: string
          financial_document_id: string
          fund_id?: string | null
          giver_name: string
          giver_profile_id?: string | null
          giving_type: string
          id?: string
        }
        Update: {
          campaign_or_appeal?: string | null
          created_at?: string
          financial_document_id?: string
          fund_id?: string | null
          giver_name?: string
          giver_profile_id?: string | null
          giving_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "giving_records_financial_document_id_fkey"
            columns: ["financial_document_id"]
            isOneToOne: true
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giving_records_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "giving_records_giver_profile_id_fkey"
            columns: ["giver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          approval_checked_at: string | null
          approval_request_id: string | null
          approved_at: string | null
          approved_by_profile_id: string | null
          base_currency_code: string
          branch_id: string | null
          created_at: string
          created_by_profile_id: string | null
          currency_code: string
          description: string
          entry_date: string
          entry_number: number
          exchange_rate_to_base: number
          id: string
          period_id: string
          posted_at: string | null
          reference: string | null
          reversal_of_entry_id: string | null
          source_id: string | null
          source_type: string | null
          status: string
        }
        Insert: {
          approval_checked_at?: string | null
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by_profile_id?: string | null
          base_currency_code: string
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          currency_code: string
          description: string
          entry_date: string
          entry_number?: never
          exchange_rate_to_base?: number
          id?: string
          period_id: string
          posted_at?: string | null
          reference?: string | null
          reversal_of_entry_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
        }
        Update: {
          approval_checked_at?: string | null
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by_profile_id?: string | null
          base_currency_code?: string
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          currency_code?: string
          description?: string
          entry_date?: string
          entry_number?: never
          exchange_rate_to_base?: number
          id?: string
          period_id?: string
          posted_at?: string | null
          reference?: string | null
          reversal_of_entry_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_base_currency_code_fkey"
            columns: ["base_currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversal_of_entry_id_fkey"
            columns: ["reversal_of_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          base_credit_amount: number
          base_debit_amount: number
          branch_id: string | null
          created_at: string
          credit_amount: number
          debit_amount: number
          description: string | null
          fund_id: string | null
          id: string
          journal_entry_id: string
          line_number: number
          profile_id: string | null
        }
        Insert: {
          account_id: string
          base_credit_amount?: number
          base_debit_amount?: number
          branch_id?: string | null
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          fund_id?: string | null
          id?: string
          journal_entry_id: string
          line_number: number
          profile_id?: string | null
        }
        Update: {
          account_id?: string
          base_credit_amount?: number
          base_debit_amount?: number
          branch_id?: string | null
          created_at?: string
          credit_amount?: number
          debit_amount?: number
          description?: string | null
          fund_id?: string | null
          id?: string
          journal_entry_id?: string
          line_number?: number
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_transfers: {
        Row: {
          approved_at: string | null
          approved_by_profile_id: string | null
          created_at: string
          from_branch_id: string | null
          id: string
          member_id: string
          notes: string | null
          requested_at: string
          requested_by_profile_id: string | null
          status: string
          to_branch_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_profile_id?: string | null
          created_at?: string
          from_branch_id?: string | null
          id?: string
          member_id: string
          notes?: string | null
          requested_at?: string
          requested_by_profile_id?: string | null
          status?: string
          to_branch_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by_profile_id?: string | null
          created_at?: string
          from_branch_id?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          requested_at?: string
          requested_by_profile_id?: string | null
          status?: string
          to_branch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_transfers_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfers_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      ministries: {
        Row: {
          branch_id: string | null
          category: string | null
          created_at: string
          description: string | null
          entity_type: string
          id: string
          meeting_time: string | null
          name: string
          roles_and_responsibilities: Json
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          entity_type: string
          id?: string
          meeting_time?: string | null
          name: string
          roles_and_responsibilities?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          entity_type?: string
          id?: string
          meeting_time?: string | null
          name?: string
          roles_and_responsibilities?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      ministry_members: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          duty: string | null
          id: string
          joined_at: string
          member_id: string
          ministry_id: string
          role_title: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          duty?: string | null
          id?: string
          joined_at?: string
          member_id: string
          ministry_id: string
          role_title?: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          duty?: string | null
          id?: string
          joined_at?: string
          member_id?: string
          ministry_id?: string
          role_title?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministry_members_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministry_members_ministry_id_fkey"
            columns: ["ministry_id"]
            isOneToOne: false
            referencedRelation: "ministries"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          created_at: string
          delivery_status: string
          id: string
          notification_id: string
          profile_id: string
          read_at: string | null
        }
        Insert: {
          created_at?: string
          delivery_status?: string
          id?: string
          notification_id: string
          profile_id: string
          read_at?: string | null
        }
        Update: {
          created_at?: string
          delivery_status?: string
          id?: string
          notification_id?: string
          profile_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_recipients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by_profile_id: string | null
          id: string
          message: string
          notification_type: string
          published_at: string | null
          status: string
          title: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          message: string
          notification_type?: string
          published_at?: string | null
          status?: string
          title: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          message?: string
          notification_type?: string
          published_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_transactions: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          financial_document_id: string | null
          id: string
          idempotency_key: string | null
          provider: string
          provider_transaction_id: string | null
          received_at: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code: string
          financial_document_id?: string | null
          id?: string
          idempotency_key?: string | null
          provider: string
          provider_transaction_id?: string | null
          received_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          financial_document_id?: string | null
          id?: string
          idempotency_key?: string | null
          provider?: string
          provider_transaction_id?: string | null
          received_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_transactions_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payment_gateway_transactions_financial_document_id_fkey"
            columns: ["financial_document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          module: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          module: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          module?: string
        }
        Relationships: []
      }
      profile_role_assignments: {
        Row: {
          assigned_at: string
          assigned_by_profile_id: string | null
          branch_id: string | null
          district_id: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          profile_id: string
          role_id: string
          scope_type: string
        }
        Insert: {
          assigned_at?: string
          assigned_by_profile_id?: string | null
          branch_id?: string | null
          district_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          profile_id: string
          role_id: string
          scope_type: string
        }
        Update: {
          assigned_at?: string
          assigned_by_profile_id?: string | null
          branch_id?: string | null
          district_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          profile_id?: string
          role_id?: string
          scope_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_role_assignments_assigned_by_profile_id_fkey"
            columns: ["assigned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_role_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_role_assignments_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_role_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          baptism_date: string | null
          baptized_by_name_snapshot: string | null
          baptized_by_profile_id: string | null
          branch_id: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          gender: string | null
          id: string
          is_baptized: boolean
          last_name: string
          marital_status: string | null
          marriage_date: string | null
          membership_date: string | null
          membership_status: string
          phone: string | null
          portal_access_status: string
          record_status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          baptism_date?: string | null
          baptized_by_name_snapshot?: string | null
          baptized_by_profile_id?: string | null
          branch_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          is_baptized?: boolean
          last_name: string
          marital_status?: string | null
          marriage_date?: string | null
          membership_date?: string | null
          membership_status?: string
          phone?: string | null
          portal_access_status?: string
          record_status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          baptism_date?: string | null
          baptized_by_name_snapshot?: string | null
          baptized_by_profile_id?: string | null
          branch_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          is_baptized?: boolean
          last_name?: string
          marital_status?: string | null
          marriage_date?: string | null
          membership_date?: string | null
          membership_status?: string
          phone?: string | null
          portal_access_status?: string
          record_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_baptized_by_profile_id_fkey"
            columns: ["baptized_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      stream_chat_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_profile_id: string
          status: string
          stream_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_profile_id: string
          status?: string
          stream_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_profile_id?: string
          status?: string
          stream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_chat_messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_chat_messages_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "streams"
            referencedColumns: ["id"]
          },
        ]
      }
      streams: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by_profile_id: string | null
          description: string | null
          ended_at: string | null
          id: string
          platform: string | null
          scheduled_start: string | null
          started_at: string | null
          status: string
          stream_url: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          platform?: string | null
          scheduled_start?: string | null
          started_at?: string | null
          status?: string
          stream_url?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          ended_at?: string | null
          id?: string
          platform?: string | null
          scheduled_start?: string | null
          started_at?: string | null
          status?: string
          stream_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "streams_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streams_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_assistance: {
        Row: {
          approved_by_profile_id: string | null
          assistance_type: string
          case_id: string
          created_at: string
          description: string | null
          financial_document_id: string | null
          id: string
          provided_at: string | null
        }
        Insert: {
          approved_by_profile_id?: string | null
          assistance_type: string
          case_id: string
          created_at?: string
          description?: string | null
          financial_document_id?: string | null
          id?: string
          provided_at?: string | null
        }
        Update: {
          approved_by_profile_id?: string | null
          assistance_type?: string
          case_id?: string
          created_at?: string
          description?: string | null
          financial_document_id?: string | null
          id?: string
          provided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "welfare_assistance_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_assistance_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "welfare_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_assistance_financial_document_id_fkey"
            columns: ["financial_document_id"]
            isOneToOne: true
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_campaigns: {
        Row: {
          beneficiary: string | null
          branch_id: string | null
          campaign_name: string
          created_at: string
          created_by_profile_id: string | null
          currency_code: string
          deadline: string | null
          expected_contribution: number
          id: string
          purpose: string | null
          status: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          beneficiary?: string | null
          branch_id?: string | null
          campaign_name: string
          created_at?: string
          created_by_profile_id?: string | null
          currency_code: string
          deadline?: string | null
          expected_contribution?: number
          id?: string
          purpose?: string | null
          status?: string
          target_amount: number
          updated_at?: string
        }
        Update: {
          beneficiary?: string | null
          branch_id?: string | null
          campaign_name?: string
          created_at?: string
          created_by_profile_id?: string | null
          currency_code?: string
          deadline?: string | null
          expected_contribution?: number
          id?: string
          purpose?: string | null
          status?: string
          target_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_campaigns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_campaigns_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_campaigns_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      welfare_cases: {
        Row: {
          assigned_to_profile_id: string | null
          branch_id: string | null
          case_type: string
          created_at: string
          created_by_profile_id: string | null
          id: string
          member_id: string
          priority: string
          reason: string
          restricted_description: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to_profile_id?: string | null
          branch_id?: string | null
          case_type: string
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          member_id: string
          priority?: string
          reason: string
          restricted_description?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to_profile_id?: string | null
          branch_id?: string | null
          case_type?: string
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          member_id?: string
          priority?: string
          reason?: string
          restricted_description?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_case_member_branch_fk"
            columns: ["member_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "branch_id"]
          },
          {
            foreignKeyName: "welfare_cases_assigned_to_profile_id_fkey"
            columns: ["assigned_to_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_cases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "church_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_cases_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      welfare_contributions: {
        Row: {
          campaign_id: string
          contributing_member_id: string | null
          contribution_date: string
          created_at: string
          financial_document_id: string
          id: string
        }
        Insert: {
          campaign_id: string
          contributing_member_id?: string | null
          contribution_date?: string
          created_at?: string
          financial_document_id: string
          id?: string
        }
        Update: {
          campaign_id?: string
          contributing_member_id?: string | null
          contribution_date?: string
          created_at?: string
          financial_document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welfare_contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "welfare_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_contributions_contributing_member_id_fkey"
            columns: ["contributing_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welfare_contributions_financial_document_id_fkey"
            columns: ["financial_document_id"]
            isOneToOne: true
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
