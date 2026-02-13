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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      actual_shifts_worked: {
        Row: {
          actual_hours: number | null
          avg_check: number | null
          business_date: string
          clock_in: string
          clock_out: string | null
          covers_served: number | null
          created_at: string
          customer_complaints: number | null
          employee_id: string
          hourly_rate: number
          id: string
          notes: string | null
          overtime_hours: number | null
          overtime_pay: number | null
          position_id: string
          regular_pay: number | null
          scheduled_hours: number | null
          shift_type: string
          tables_served: number | null
          tips: number | null
          total_compensation: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          actual_hours?: number | null
          avg_check?: number | null
          business_date: string
          clock_in: string
          clock_out?: string | null
          covers_served?: number | null
          created_at?: string
          customer_complaints?: number | null
          employee_id: string
          hourly_rate: number
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          overtime_pay?: number | null
          position_id: string
          regular_pay?: number | null
          scheduled_hours?: number | null
          shift_type: string
          tables_served?: number | null
          tips?: number | null
          total_compensation?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          actual_hours?: number | null
          avg_check?: number | null
          business_date?: string
          clock_in?: string
          clock_out?: string | null
          covers_served?: number | null
          created_at?: string
          customer_complaints?: number | null
          employee_id?: string
          hourly_rate?: number
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          overtime_pay?: number | null
          position_id?: string
          regular_pay?: number | null
          scheduled_hours?: number | null
          shift_type?: string
          tables_served?: number | null
          tips?: number | null
          total_compensation?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actual_shifts_worked_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_shifts_worked_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "cplh_by_position_shift"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "actual_shifts_worked_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actual_shifts_worked_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "actual_shifts_worked_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_comp_review_cache: {
        Row: {
          business_date: string
          created_at: string | null
          expires_at: string | null
          id: string
          input_hash: string
          result: Json
          venue_id: string
        }
        Insert: {
          business_date: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          input_hash: string
          result: Json
          venue_id: string
        }
        Update: {
          business_date?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          input_hash?: string
          result?: Json
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_comp_review_cache_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "ai_comp_review_cache_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_events: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          metadata: Json | null
          severity: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          metadata?: Json | null
          severity?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: Database["public"]["Enums"]["alert_type"]
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          severity?: string | null
        }
        Relationships: []
      }
      ap_approvals: {
        Row: {
          approved_at: string | null
          approver_user_id: string
          created_at: string | null
          id: string
          invoice_id: string
          notes: string | null
          status: Database["public"]["Enums"]["approval_status"]
        }
        Insert: {
          approved_at?: string | null
          approver_user_id: string
          created_at?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Update: {
          approved_at?: string | null
          approver_user_id?: string
          created_at?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ap_approvals_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_export_batches: {
        Row: {
          batch_date: string
          checksum: string | null
          created_at: string | null
          exported_by: string | null
          id: string
          invoice_count: number | null
          storage_path: string
          total_amount: number | null
        }
        Insert: {
          batch_date: string
          checksum?: string | null
          created_at?: string | null
          exported_by?: string | null
          id?: string
          invoice_count?: number | null
          storage_path: string
          total_amount?: number | null
        }
        Update: {
          batch_date?: string
          checksum?: string | null
          created_at?: string | null
          exported_by?: string | null
          id?: string
          invoice_count?: number | null
          storage_path?: string
          total_amount?: number | null
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          actual_start: string | null
          business_date: string
          created_at: string
          employee_id: string
          id: string
          minutes_late: number | null
          notes: string | null
          points_assessed: number | null
          reason: string | null
          scheduled_start: string | null
          shift_assignment_id: string | null
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          actual_start?: string | null
          business_date: string
          created_at?: string
          employee_id: string
          id?: string
          minutes_late?: number | null
          notes?: string | null
          points_assessed?: number | null
          reason?: string | null
          scheduled_start?: string | null
          shift_assignment_id?: string | null
          status: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          actual_start?: string | null
          business_date?: string
          created_at?: string
          employee_id?: string
          id?: string
          minutes_late?: number | null
          notes?: string | null
          points_assessed?: number | null
          reason?: string | null
          scheduled_start?: string | null
          shift_assignment_id?: string | null
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_shift_assignment_id_fkey"
            columns: ["shift_assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "attendance_records_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      attestation_thresholds: {
        Row: {
          comp_pct_threshold: number | null
          created_at: string | null
          high_comp_amount: number | null
          id: string
          labor_variance_pct: number | null
          overtime_hours_threshold: number | null
          revenue_variance_pct: number | null
          updated_at: string | null
          venue_id: string
          walkout_count_threshold: number | null
        }
        Insert: {
          comp_pct_threshold?: number | null
          created_at?: string | null
          high_comp_amount?: number | null
          id?: string
          labor_variance_pct?: number | null
          overtime_hours_threshold?: number | null
          revenue_variance_pct?: number | null
          updated_at?: string | null
          venue_id: string
          walkout_count_threshold?: number | null
        }
        Update: {
          comp_pct_threshold?: number | null
          created_at?: string | null
          high_comp_amount?: number | null
          id?: string
          labor_variance_pct?: number | null
          overtime_hours_threshold?: number | null
          revenue_variance_pct?: number | null
          updated_at?: string | null
          venue_id?: string
          walkout_count_threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attestation_thresholds_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "attestation_thresholds_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_job_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_seconds: number | null
          error: string | null
          id: string
          job_name: string
          output: Json | null
          started_at: string
          status: string
          venue_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error?: string | null
          id?: string
          job_name: string
          output?: Json | null
          started_at?: string
          status?: string
          venue_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error?: string | null
          id?: string
          job_name?: string
          output?: Json | null
          started_at?: string
          status?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_job_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "automation_job_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      backtest_results: {
        Row: {
          accuracy_pct: number | null
          backtest_type: string | null
          business_date: string
          coverage_pct: number | null
          created_at: string
          hourly_detail: Json | null
          hours_adequate: number
          hours_analyzed: number
          hours_overstaffed: number
          hours_understaffed: number
          id: string
          profile_version: number | null
          scenario: string
          understaffed_labor_hours: number | null
          venue_id: string
          wasted_labor_cost: number | null
          wasted_labor_hours: number | null
        }
        Insert: {
          accuracy_pct?: number | null
          backtest_type?: string | null
          business_date: string
          coverage_pct?: number | null
          created_at?: string
          hourly_detail?: Json | null
          hours_adequate?: number
          hours_analyzed: number
          hours_overstaffed?: number
          hours_understaffed?: number
          id?: string
          profile_version?: number | null
          scenario: string
          understaffed_labor_hours?: number | null
          venue_id: string
          wasted_labor_cost?: number | null
          wasted_labor_hours?: number | null
        }
        Update: {
          accuracy_pct?: number | null
          backtest_type?: string | null
          business_date?: string
          coverage_pct?: number | null
          created_at?: string
          hourly_detail?: Json | null
          hours_adequate?: number
          hours_analyzed?: number
          hours_overstaffed?: number
          hours_understaffed?: number
          id?: string
          profile_version?: number | null
          scenario?: string
          understaffed_labor_hours?: number | null
          venue_id?: string
          wasted_labor_cost?: number | null
          wasted_labor_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "backtest_results_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "backtest_results_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      bias_decay_config: {
        Row: {
          created_at: string | null
          decay_rate: number
          id: string
          is_active: boolean
          max_decay_cycles: number | null
          min_offset_threshold: number
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          decay_rate?: number
          id?: string
          is_active?: boolean
          max_decay_cycles?: number | null
          min_offset_threshold?: number
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          decay_rate?: number
          id?: string
          is_active?: boolean
          max_decay_cycles?: number | null
          min_offset_threshold?: number
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bias_decay_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "bias_decay_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      bias_decay_log: {
        Row: {
          decay_cycle: number
          decay_rate: number
          decayed_at: string | null
          id: string
          offsets_after: Json
          offsets_before: Json
          venue_id: string
        }
        Insert: {
          decay_cycle: number
          decay_rate: number
          decayed_at?: string | null
          id?: string
          offsets_after: Json
          offsets_before: Json
          venue_id: string
        }
        Update: {
          decay_cycle?: number
          decay_rate?: number
          decayed_at?: string | null
          id?: string
          offsets_after?: Json
          offsets_before?: Json
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bias_decay_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "bias_decay_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          created_at: string | null
          department_id: string
          id: string
          initial_budget: number
          notes: string | null
          period_days: number
          period_start: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          department_id: string
          id?: string
          initial_budget: number
          notes?: string | null
          period_days?: number
          period_start: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          department_id?: string
          id?: string
          initial_budget?: number
          notes?: string | null
          period_days?: number
          period_start?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_configs: {
        Row: {
          camera_id: string
          camera_name: string | null
          created_at: string
          host_id: string
          id: string
          is_active: boolean
          last_polled_at: string | null
          last_snapshot_hash: string | null
          service_end_hour: number
          service_start_hour: number
          snapshot_height: number | null
          snapshot_width: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          camera_id: string
          camera_name?: string | null
          created_at?: string
          host_id: string
          id?: string
          is_active?: boolean
          last_polled_at?: string | null
          last_snapshot_hash?: string | null
          service_end_hour?: number
          service_start_hour?: number
          snapshot_height?: number | null
          snapshot_width?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          camera_id?: string
          camera_name?: string | null
          created_at?: string
          host_id?: string
          id?: string
          is_active?: boolean
          last_polled_at?: string | null
          last_snapshot_hash?: string | null
          service_end_hour?: number
          service_start_hour?: number
          snapshot_height?: number | null
          snapshot_width?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "camera_configs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "camera_configs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      category_day_facts: {
        Row: {
          business_date: string
          category: string
          comps_total: number | null
          created_at: string | null
          etl_run_id: string | null
          gross_sales: number
          id: string
          last_synced_at: string
          net_sales: number
          quantity_sold: number | null
          venue_id: string
          voids_total: number | null
        }
        Insert: {
          business_date: string
          category: string
          comps_total?: number | null
          created_at?: string | null
          etl_run_id?: string | null
          gross_sales?: number
          id?: string
          last_synced_at?: string
          net_sales?: number
          quantity_sold?: number | null
          venue_id: string
          voids_total?: number | null
        }
        Update: {
          business_date?: string
          category?: string
          comps_total?: number | null
          created_at?: string | null
          etl_run_id?: string | null
          gross_sales?: number
          id?: string
          last_synced_at?: string
          net_sales?: number
          quantity_sold?: number | null
          venue_id?: string
          voids_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "category_day_facts_etl_run_id_fkey"
            columns: ["etl_run_id"]
            isOneToOne: false
            referencedRelation: "etl_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "category_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          employee_id: string
          id: string
          is_active: boolean | null
          is_muted: boolean | null
          joined_at: string
          last_read_at: string | null
          left_at: string | null
          notification_preference: string | null
          role: string
          unread_count: number | null
        }
        Insert: {
          channel_id: string
          employee_id: string
          id?: string
          is_active?: boolean | null
          is_muted?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          notification_preference?: string | null
          role?: string
          unread_count?: number | null
        }
        Update: {
          channel_id?: string
          employee_id?: string
          id?: string
          is_active?: boolean | null
          is_muted?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          notification_preference?: string | null
          role?: string
          unread_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "message_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_conversations: {
        Row: {
          answer: string | null
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          model: string | null
          org_id: string
          question: string
          response_time_ms: number | null
          tool_calls: number | null
          tools_used: string[] | null
          user_id: string
          venue_ids: string[] | null
        }
        Insert: {
          answer?: string | null
          conversation_id: string
          created_at?: string
          error?: string | null
          id?: string
          model?: string | null
          org_id: string
          question: string
          response_time_ms?: number | null
          tool_calls?: number | null
          tools_used?: string[] | null
          user_id: string
          venue_ids?: string[] | null
        }
        Update: {
          answer?: string | null
          conversation_id?: string
          created_at?: string
          error?: string | null
          id?: string
          model?: string | null
          org_id?: string
          question?: string
          response_time_ms?: number | null
          tool_calls?: number | null
          tools_used?: string[] | null
          user_id?: string
          venue_ids?: string[] | null
        }
        Relationships: []
      }
      coaching_actions: {
        Row: {
          action_taken: string | null
          attestation_id: string
          business_date: string
          coaching_type: string
          created_at: string | null
          employee_name: string
          follow_up_date: string | null
          id: string
          reason: string
          status: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          action_taken?: string | null
          attestation_id: string
          business_date: string
          coaching_type: string
          created_at?: string | null
          employee_name: string
          follow_up_date?: string | null
          id?: string
          reason: string
          status?: string
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          action_taken?: string | null
          attestation_id?: string
          business_date?: string
          coaching_type?: string
          created_at?: string | null
          employee_name?: string
          follow_up_date?: string | null
          id?: string
          reason?: string
          status?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_actions_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "nightly_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_actions_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "pending_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "coaching_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_resolutions: {
        Row: {
          approved_by: string | null
          attestation_id: string
          business_date: string
          check_amount: number | null
          check_id: string | null
          comp_amount: number | null
          comp_reason_pos: string | null
          created_at: string | null
          employee_name: string | null
          id: string
          is_policy_violation: boolean | null
          requires_follow_up: boolean | null
          resolution_code: string
          resolution_notes: string | null
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          approved_by?: string | null
          attestation_id: string
          business_date: string
          check_amount?: number | null
          check_id?: string | null
          comp_amount?: number | null
          comp_reason_pos?: string | null
          created_at?: string | null
          employee_name?: string | null
          id?: string
          is_policy_violation?: boolean | null
          requires_follow_up?: boolean | null
          resolution_code: string
          resolution_notes?: string | null
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          approved_by?: string | null
          attestation_id?: string
          business_date?: string
          check_amount?: number | null
          check_id?: string | null
          comp_amount?: number | null
          comp_reason_pos?: string | null
          created_at?: string | null
          employee_name?: string | null
          id?: string
          is_policy_violation?: boolean | null
          requires_follow_up?: boolean | null
          resolution_code?: string
          resolution_notes?: string | null
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comp_resolutions_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "nightly_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_resolutions_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "pending_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_resolutions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "comp_resolutions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_settings: {
        Row: {
          ai_max_tokens: number
          ai_model: string
          ai_temperature: number
          approved_reasons: Json
          created_at: string
          created_by: string | null
          daily_comp_pct_critical: number
          daily_comp_pct_warning: number
          effective_from: string
          effective_to: string | null
          high_comp_pct_threshold: number
          high_value_comp_threshold: number
          is_active: boolean
          manager_min_for_high_value: number
          manager_roles: Json
          org_id: string
          server_max_comp_amount: number
          superseded_by_org_id: string | null
          superseded_by_version: number | null
          updated_at: string
          version: number
        }
        Insert: {
          ai_max_tokens?: number
          ai_model?: string
          ai_temperature?: number
          approved_reasons?: Json
          created_at?: string
          created_by?: string | null
          daily_comp_pct_critical?: number
          daily_comp_pct_warning?: number
          effective_from?: string
          effective_to?: string | null
          high_comp_pct_threshold?: number
          high_value_comp_threshold?: number
          is_active?: boolean
          manager_min_for_high_value?: number
          manager_roles?: Json
          org_id: string
          server_max_comp_amount?: number
          superseded_by_org_id?: string | null
          superseded_by_version?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          ai_max_tokens?: number
          ai_model?: string
          ai_temperature?: number
          approved_reasons?: Json
          created_at?: string
          created_by?: string | null
          daily_comp_pct_critical?: number
          daily_comp_pct_warning?: number
          effective_from?: string
          effective_to?: string | null
          high_comp_pct_threshold?: number
          high_value_comp_threshold?: number
          is_active?: boolean
          manager_min_for_high_value?: number
          manager_roles?: Json
          org_id?: string
          server_max_comp_amount?: number
          superseded_by_org_id?: string | null
          superseded_by_version?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "comp_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_settings_superseded_by_fkey"
            columns: ["superseded_by_org_id", "superseded_by_version"]
            isOneToOne: false
            referencedRelation: "comp_settings"
            referencedColumns: ["org_id", "version"]
          },
        ]
      }
      covers_per_labor_hour_targets: {
        Row: {
          benchmark_source: string | null
          covers_range_max: number | null
          covers_range_min: number | null
          created_at: string
          day_of_week: number | null
          effective_from: string
          effective_until: string | null
          historical_sample_size: number | null
          id: string
          is_active: boolean | null
          max_cplh: number
          min_cplh: number
          optimal_cplh: number
          position_id: string | null
          shift_type: string | null
          source: string | null
          target_cplh: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          benchmark_source?: string | null
          covers_range_max?: number | null
          covers_range_min?: number | null
          created_at?: string
          day_of_week?: number | null
          effective_from?: string
          effective_until?: string | null
          historical_sample_size?: number | null
          id?: string
          is_active?: boolean | null
          max_cplh: number
          min_cplh: number
          optimal_cplh: number
          position_id?: string | null
          shift_type?: string | null
          source?: string | null
          target_cplh: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          benchmark_source?: string | null
          covers_range_max?: number | null
          covers_range_min?: number | null
          created_at?: string
          day_of_week?: number | null
          effective_from?: string
          effective_until?: string | null
          historical_sample_size?: number | null
          id?: string
          is_active?: boolean | null
          max_cplh?: number
          min_cplh?: number
          optimal_cplh?: number
          position_id?: string | null
          shift_type?: string | null
          source?: string | null
          target_cplh?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "covers_per_labor_hour_targets_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "cplh_by_position_shift"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "covers_per_labor_hour_targets_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "covers_per_labor_hour_targets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "covers_per_labor_hour_targets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      cplh_actual_vs_predicted: {
        Row: {
          actual_covers: number | null
          actual_cplh: number | null
          actual_labor_hours: number | null
          actual_service_quality_score: number | null
          business_date: string
          corrective_action: string | null
          covers_variance_pct: number | null
          cplh_variance_pct: number | null
          created_at: string
          customer_complaints: number | null
          id: string
          labor_hours_variance_pct: number | null
          measured_at: string | null
          predicted_covers: number
          predicted_cplh: number
          predicted_labor_hours: number
          schedule_id: string | null
          shift_type: string
          variance_reason: string | null
          venue_id: string
        }
        Insert: {
          actual_covers?: number | null
          actual_cplh?: number | null
          actual_labor_hours?: number | null
          actual_service_quality_score?: number | null
          business_date: string
          corrective_action?: string | null
          covers_variance_pct?: number | null
          cplh_variance_pct?: number | null
          created_at?: string
          customer_complaints?: number | null
          id?: string
          labor_hours_variance_pct?: number | null
          measured_at?: string | null
          predicted_covers: number
          predicted_cplh: number
          predicted_labor_hours: number
          schedule_id?: string | null
          shift_type: string
          variance_reason?: string | null
          venue_id: string
        }
        Update: {
          actual_covers?: number | null
          actual_cplh?: number | null
          actual_labor_hours?: number | null
          actual_service_quality_score?: number | null
          business_date?: string
          corrective_action?: string | null
          covers_variance_pct?: number | null
          cplh_variance_pct?: number | null
          created_at?: string
          customer_complaints?: number | null
          id?: string
          labor_hours_variance_pct?: number | null
          measured_at?: string | null
          predicted_covers?: number
          predicted_cplh?: number
          predicted_labor_hours?: number
          schedule_id?: string | null
          shift_type?: string
          variance_reason?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cplh_actual_vs_predicted_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "weekly_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cplh_actual_vs_predicted_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "cplh_actual_vs_predicted_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_databases: {
        Row: {
          connection_error: string | null
          created_at: string
          created_by: string | null
          db_host: string
          db_name: string
          db_password_encrypted: string
          db_port: number
          db_ssl: boolean
          db_ssl_mode: string | null
          db_user: string
          id: string
          is_active: boolean
          last_connection_status: string | null
          last_connection_test: string | null
          organization_id: string | null
          pool_max: number | null
          pool_min: number | null
          updated_at: string
        }
        Insert: {
          connection_error?: string | null
          created_at?: string
          created_by?: string | null
          db_host: string
          db_name: string
          db_password_encrypted: string
          db_port?: number
          db_ssl?: boolean
          db_ssl_mode?: string | null
          db_user: string
          id?: string
          is_active?: boolean
          last_connection_status?: string | null
          last_connection_test?: string | null
          organization_id?: string | null
          pool_max?: number | null
          pool_min?: number | null
          updated_at?: string
        }
        Update: {
          connection_error?: string | null
          created_at?: string
          created_by?: string | null
          db_host?: string
          db_name?: string
          db_password_encrypted?: string
          db_port?: number
          db_ssl?: boolean
          db_ssl_mode?: string | null
          db_user?: string
          id?: string
          is_active?: boolean
          last_connection_status?: string | null
          last_connection_test?: string | null
          organization_id?: string | null
          pool_max?: number | null
          pool_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_databases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_spend_facts: {
        Row: {
          created_at: string | null
          department_id: string | null
          id: string
          source: string | null
          total_spend: number
          txn_date: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          id?: string
          source?: string | null
          total_spend?: number
          txn_date: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          id?: string
          source?: string | null
          total_spend?: number
          txn_date?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_spend_facts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_spend_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "daily_spend_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_staffing_forecasts: {
        Row: {
          created_at: string
          day_of_week: number
          estimated_covers: number | null
          estimated_labor_cost: number | null
          estimated_revenue: number | null
          forecast_date: string
          hourly_detail: Json
          id: string
          profile_version: number | null
          scenario: string
          seasonal_factor: number | null
          seasonal_note: string | null
          status: string | null
          total_bartenders: number
          total_labor_hours: number | null
          total_servers: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          estimated_covers?: number | null
          estimated_labor_cost?: number | null
          estimated_revenue?: number | null
          forecast_date: string
          hourly_detail: Json
          id?: string
          profile_version?: number | null
          scenario: string
          seasonal_factor?: number | null
          seasonal_note?: string | null
          status?: string | null
          total_bartenders: number
          total_labor_hours?: number | null
          total_servers: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          estimated_covers?: number | null
          estimated_labor_cost?: number | null
          estimated_revenue?: number | null
          forecast_date?: string
          hourly_detail?: Json
          id?: string
          profile_version?: number | null
          scenario?: string
          seasonal_factor?: number | null
          seasonal_note?: string | null
          status?: string | null
          total_bartenders?: number
          total_labor_hours?: number | null
          total_servers?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_staffing_forecasts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "daily_staffing_forecasts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      daypart_day_facts: {
        Row: {
          avg_check: number | null
          business_date: string
          checks_count: number
          comps_total: number | null
          covers_count: number
          created_at: string | null
          daypart: Database["public"]["Enums"]["daypart_type"]
          etl_run_id: string | null
          gross_sales: number
          id: string
          last_synced_at: string
          net_sales: number
          venue_id: string
        }
        Insert: {
          avg_check?: number | null
          business_date: string
          checks_count?: number
          comps_total?: number | null
          covers_count?: number
          created_at?: string | null
          daypart: Database["public"]["Enums"]["daypart_type"]
          etl_run_id?: string | null
          gross_sales?: number
          id?: string
          last_synced_at?: string
          net_sales?: number
          venue_id: string
        }
        Update: {
          avg_check?: number | null
          business_date?: string
          checks_count?: number
          comps_total?: number | null
          covers_count?: number
          created_at?: string | null
          daypart?: Database["public"]["Enums"]["daypart_type"]
          etl_run_id?: string | null
          gross_sales?: number
          id?: string
          last_synced_at?: string
          net_sales?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daypart_day_facts_etl_run_id_fkey"
            columns: ["etl_run_id"]
            isOneToOne: false
            referencedRelation: "etl_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daypart_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "daypart_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_forecasts: {
        Row: {
          business_date: string
          confidence_level: number | null
          covers_lower: number
          covers_predicted: number
          covers_upper: number
          created_at: string
          day_type: Database["public"]["Enums"]["day_type"] | null
          events: Json | null
          forecast_date: string
          forecast_source: string | null
          id: string
          labor_cost_estimate: number | null
          labor_percentage_estimate: number | null
          model_accuracy: number | null
          model_version: string
          reservation_covers_predicted: number | null
          revenue_predicted: number | null
          seasonal_event_id: string | null
          seasonal_uplift_applied: number | null
          shift_type: string
          venue_id: string
          walkin_covers_predicted: number | null
          weather_forecast: Json | null
        }
        Insert: {
          business_date: string
          confidence_level?: number | null
          covers_lower: number
          covers_predicted: number
          covers_upper: number
          created_at?: string
          day_type?: Database["public"]["Enums"]["day_type"] | null
          events?: Json | null
          forecast_date: string
          forecast_source?: string | null
          id?: string
          labor_cost_estimate?: number | null
          labor_percentage_estimate?: number | null
          model_accuracy?: number | null
          model_version: string
          reservation_covers_predicted?: number | null
          revenue_predicted?: number | null
          seasonal_event_id?: string | null
          seasonal_uplift_applied?: number | null
          shift_type: string
          venue_id: string
          walkin_covers_predicted?: number | null
          weather_forecast?: Json | null
        }
        Update: {
          business_date?: string
          confidence_level?: number | null
          covers_lower?: number
          covers_predicted?: number
          covers_upper?: number
          created_at?: string
          day_type?: Database["public"]["Enums"]["day_type"] | null
          events?: Json | null
          forecast_date?: string
          forecast_source?: string | null
          id?: string
          labor_cost_estimate?: number | null
          labor_percentage_estimate?: number | null
          model_accuracy?: number | null
          model_version?: string
          reservation_covers_predicted?: number | null
          revenue_predicted?: number | null
          seasonal_event_id?: string | null
          seasonal_uplift_applied?: number | null
          shift_type?: string
          venue_id?: string
          walkin_covers_predicted?: number | null
          weather_forecast?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_forecasts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "demand_forecasts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_history: {
        Row: {
          avg_check: number | null
          business_date: string
          covers: number
          created_at: string
          day_of_week: number
          event_details: Json | null
          has_nearby_event: boolean | null
          hour_slot: number | null
          id: string
          is_holiday: boolean | null
          is_special_event: boolean | null
          party_size_avg: number | null
          reservation_count: number | null
          reservation_covers: number | null
          revenue: number
          shift_type: string
          venue_id: string
          walkin_covers: number | null
          weather_conditions: string | null
          weather_precipitation: number | null
          weather_temp_high: number | null
          weather_temp_low: number | null
        }
        Insert: {
          avg_check?: number | null
          business_date: string
          covers: number
          created_at?: string
          day_of_week: number
          event_details?: Json | null
          has_nearby_event?: boolean | null
          hour_slot?: number | null
          id?: string
          is_holiday?: boolean | null
          is_special_event?: boolean | null
          party_size_avg?: number | null
          reservation_count?: number | null
          reservation_covers?: number | null
          revenue: number
          shift_type: string
          venue_id: string
          walkin_covers?: number | null
          weather_conditions?: string | null
          weather_precipitation?: number | null
          weather_temp_high?: number | null
          weather_temp_low?: number | null
        }
        Update: {
          avg_check?: number | null
          business_date?: string
          covers?: number
          created_at?: string
          day_of_week?: number
          event_details?: Json | null
          has_nearby_event?: boolean | null
          hour_slot?: number | null
          id?: string
          is_holiday?: boolean | null
          is_special_event?: boolean | null
          party_size_avg?: number | null
          reservation_count?: number | null
          reservation_covers?: number | null
          revenue?: number
          shift_type?: string
          venue_id?: string
          walkin_covers?: number | null
          weather_conditions?: string | null
          weather_precipitation?: number | null
          weather_temp_high?: number | null
          weather_temp_low?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_history_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "demand_history_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: Database["public"]["Enums"]["department_type"]
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: Database["public"]["Enums"]["department_type"]
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: Database["public"]["Enums"]["department_type"]
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "departments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attachments: {
        Row: {
          attachment_name: string
          attachment_size_bytes: number | null
          attachment_type: string | null
          created_at: string
          id: string
          ocr_confidence: number | null
          processed: boolean
          storage_path: string | null
          storage_url: string | null
          synced_email_id: string
        }
        Insert: {
          attachment_name: string
          attachment_size_bytes?: number | null
          attachment_type?: string | null
          created_at?: string
          id?: string
          ocr_confidence?: number | null
          processed?: boolean
          storage_path?: string | null
          storage_url?: string | null
          synced_email_id: string
        }
        Update: {
          attachment_name?: string
          attachment_size_bytes?: number | null
          attachment_type?: string | null
          created_at?: string
          id?: string
          ocr_confidence?: number | null
          processed?: boolean
          storage_path?: string | null
          storage_url?: string | null
          synced_email_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_synced_email_id_fkey"
            columns: ["synced_email_id"]
            isOneToOne: false
            referencedRelation: "synced_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_config: {
        Row: {
          auto_process_invoices: boolean
          created_at: string
          default_venue_id: string | null
          email_address: string
          email_type: string
          enabled: boolean
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          organization_id: string
          sender_whitelist: string[] | null
          subject_keywords: string[] | null
          total_emails_synced: number | null
          total_invoices_created: number | null
          updated_at: string
        }
        Insert: {
          auto_process_invoices?: boolean
          created_at?: string
          default_venue_id?: string | null
          email_address: string
          email_type: string
          enabled?: boolean
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          organization_id: string
          sender_whitelist?: string[] | null
          subject_keywords?: string[] | null
          total_emails_synced?: number | null
          total_invoices_created?: number | null
          updated_at?: string
        }
        Update: {
          auto_process_invoices?: boolean
          created_at?: string
          default_venue_id?: string | null
          email_address?: string
          email_type?: string
          enabled?: boolean
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          organization_id?: string
          sender_whitelist?: string[] | null
          subject_keywords?: string[] | null
          total_emails_synced?: number | null
          total_invoices_created?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sync_config_default_venue_id_fkey"
            columns: ["default_venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "email_sync_config_default_venue_id_fkey"
            columns: ["default_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sync_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_availability: {
        Row: {
          created_at: string
          day_of_week: number
          effective_from: string
          effective_until: string | null
          employee_id: string
          end_time: string | null
          id: string
          is_available: boolean | null
          notes: string | null
          preferred: boolean | null
          start_time: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          effective_from?: string
          effective_until?: string | null
          employee_id: string
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          notes?: string | null
          preferred?: boolean | null
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          effective_from?: string
          effective_until?: string | null
          employee_id?: string
          end_time?: string | null
          id?: string
          is_available?: boolean | null
          notes?: string | null
          preferred?: boolean | null
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_availability_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_breaks: {
        Row: {
          break_duration_minutes: number | null
          break_end: string | null
          break_start: string
          break_type: string
          compliance_notes: string | null
          created_at: string
          employee_id: string
          id: string
          is_compliant: boolean | null
          time_punch_id: string | null
          venue_id: string
        }
        Insert: {
          break_duration_minutes?: number | null
          break_end?: string | null
          break_start?: string
          break_type: string
          compliance_notes?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_compliant?: boolean | null
          time_punch_id?: string | null
          venue_id: string
        }
        Update: {
          break_duration_minutes?: number | null
          break_end?: string | null
          break_start?: string
          break_type?: string
          compliance_notes?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_compliant?: boolean | null
          time_punch_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_breaks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_breaks_time_punch_id_fkey"
            columns: ["time_punch_id"]
            isOneToOne: false
            referencedRelation: "time_punches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_breaks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "employee_breaks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_certifications: {
        Row: {
          certification_number: string | null
          certification_type: string
          created_at: string
          employee_id: string
          expiration_date: string | null
          id: string
          issue_date: string | null
        }
        Insert: {
          certification_number?: string | null
          certification_type: string
          created_at?: string
          employee_id: string
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
        }
        Update: {
          certification_number?: string | null
          certification_type?: string
          created_at?: string
          employee_id?: string
          expiration_date?: string | null
          id?: string
          issue_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_certifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_pins: {
        Row: {
          created_at: string
          employee_id: string
          expires_at: string | null
          failed_attempts: number | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          locked_until: string | null
          pin_hash: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          expires_at?: string | null
          failed_attempts?: number | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash: string
          venue_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          expires_at?: string | null
          failed_attempts?: number | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_pins_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_pins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "employee_pins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          availability: Json | null
          cannot_work_with: Json | null
          covers_per_hour_avg: number | null
          created_at: string
          email: string | null
          employment_status: string | null
          first_name: string
          hire_date: string | null
          id: string
          is_full_time: boolean | null
          last_name: string
          max_hours_per_week: number | null
          min_hours_per_week: number | null
          performance_rating: number | null
          phone: string | null
          preferred_shifts: Json | null
          primary_position_id: string | null
          termination_date: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          availability?: Json | null
          cannot_work_with?: Json | null
          covers_per_hour_avg?: number | null
          created_at?: string
          email?: string | null
          employment_status?: string | null
          first_name: string
          hire_date?: string | null
          id?: string
          is_full_time?: boolean | null
          last_name: string
          max_hours_per_week?: number | null
          min_hours_per_week?: number | null
          performance_rating?: number | null
          phone?: string | null
          preferred_shifts?: Json | null
          primary_position_id?: string | null
          termination_date?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          availability?: Json | null
          cannot_work_with?: Json | null
          covers_per_hour_avg?: number | null
          created_at?: string
          email?: string | null
          employment_status?: string | null
          first_name?: string
          hire_date?: string | null
          id?: string
          is_full_time?: boolean | null
          last_name?: string
          max_hours_per_week?: number | null
          min_hours_per_week?: number | null
          performance_rating?: number | null
          phone?: string | null
          preferred_shifts?: Json | null
          primary_position_id?: string | null
          termination_date?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_primary_position_id_fkey"
            columns: ["primary_position_id"]
            isOneToOne: false
            referencedRelation: "cplh_by_position_shift"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "employees_primary_position_id_fkey"
            columns: ["primary_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "employees_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      entertainment_artists: {
        Row: {
          created_at: string | null
          email: string | null
          entertainment_type: Database["public"]["Enums"]["entertainment_type"]
          id: string
          is_active: boolean | null
          is_coordinator: boolean | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          standard_rate: number | null
          updated_at: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          entertainment_type: Database["public"]["Enums"]["entertainment_type"]
          id?: string
          is_active?: boolean | null
          is_coordinator?: boolean | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          standard_rate?: number | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          entertainment_type?: Database["public"]["Enums"]["entertainment_type"]
          id?: string
          is_active?: boolean | null
          is_coordinator?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          standard_rate?: number | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entertainment_artists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entertainment_artists_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "entertainment_artists_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      entertainment_bookings: {
        Row: {
          artist_id: string | null
          artist_name: string | null
          booking_date: string
          config: string
          created_at: string | null
          created_by: string | null
          entertainment_type: Database["public"]["Enums"]["entertainment_type"]
          id: string
          notes: string | null
          rate_amount: number | null
          status: string | null
          time_end: string
          time_start: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          artist_id?: string | null
          artist_name?: string | null
          booking_date: string
          config: string
          created_at?: string | null
          created_by?: string | null
          entertainment_type: Database["public"]["Enums"]["entertainment_type"]
          id?: string
          notes?: string | null
          rate_amount?: number | null
          status?: string | null
          time_end: string
          time_start: string
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          artist_id?: string | null
          artist_name?: string | null
          booking_date?: string
          config?: string
          created_at?: string | null
          created_by?: string | null
          entertainment_type?: Database["public"]["Enums"]["entertainment_type"]
          id?: string
          notes?: string | null
          rate_amount?: number | null
          status?: string | null
          time_end?: string
          time_start?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entertainment_bookings_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "entertainment_artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entertainment_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "entertainment_bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      entertainment_rates: {
        Row: {
          amount: number
          artist_id: string | null
          created_at: string | null
          description: string
          entertainment_type: Database["public"]["Enums"]["entertainment_type"]
          id: string
          is_active: boolean | null
          is_flat_fee: boolean | null
          organization_id: string
          updated_at: string | null
          venue_id: string | null
        }
        Insert: {
          amount: number
          artist_id?: string | null
          created_at?: string | null
          description: string
          entertainment_type: Database["public"]["Enums"]["entertainment_type"]
          id?: string
          is_active?: boolean | null
          is_flat_fee?: boolean | null
          organization_id: string
          updated_at?: string | null
          venue_id?: string | null
        }
        Update: {
          amount?: number
          artist_id?: string | null
          created_at?: string | null
          description?: string
          entertainment_type?: Database["public"]["Enums"]["entertainment_type"]
          id?: string
          is_active?: boolean | null
          is_flat_fee?: boolean | null
          organization_id?: string
          updated_at?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entertainment_rates_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "entertainment_artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entertainment_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entertainment_rates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "entertainment_rates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      entertainment_schedule_templates: {
        Row: {
          artist_id: string | null
          config: string
          created_at: string | null
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          entertainment_type: Database["public"]["Enums"]["entertainment_type"]
          id: string
          is_active: boolean | null
          notes: string | null
          time_end: string
          time_start: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          artist_id?: string | null
          config: string
          created_at?: string | null
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          entertainment_type: Database["public"]["Enums"]["entertainment_type"]
          id?: string
          is_active?: boolean | null
          notes?: string | null
          time_end: string
          time_start: string
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          artist_id?: string | null
          config?: string
          created_at?: string | null
          day_of_week?: Database["public"]["Enums"]["day_of_week"]
          entertainment_type?: Database["public"]["Enums"]["entertainment_type"]
          id?: string
          is_active?: boolean | null
          notes?: string | null
          time_end?: string
          time_start?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entertainment_schedule_templates_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "entertainment_artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entertainment_schedule_templates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "entertainment_schedule_templates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      etl_runs: {
        Row: {
          business_date: string | null
          created_at: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          metadata: Json | null
          rows_extracted: number | null
          rows_loaded: number | null
          source: string
          started_at: string
          status: Database["public"]["Enums"]["etl_status"]
          venue_id: string | null
        }
        Insert: {
          business_date?: string | null
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          rows_extracted?: number | null
          rows_loaded?: number | null
          source?: string
          started_at?: string
          status?: Database["public"]["Enums"]["etl_status"]
          venue_id?: string | null
        }
        Update: {
          business_date?: string | null
          created_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          rows_extracted?: number | null
          rows_loaded?: number | null
          source?: string
          started_at?: string
          status?: Database["public"]["Enums"]["etl_status"]
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "etl_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "etl_runs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_object_signals: {
        Row: {
          created_at: string
          feedback_object_id: string
          signal_id: string
          signal_role: string | null
        }
        Insert: {
          created_at?: string
          feedback_object_id: string
          signal_id: string
          signal_role?: string | null
        }
        Update: {
          created_at?: string
          feedback_object_id?: string
          signal_id?: string
          signal_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_object_signals_feedback_object_id_fkey"
            columns: ["feedback_object_id"]
            isOneToOne: false
            referencedRelation: "feedback_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_object_signals_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_objects: {
        Row: {
          assigned_to: string | null
          business_date: string
          confidence: number | null
          created_at: string
          domain: Database["public"]["Enums"]["feedback_domain"]
          due_at: string | null
          escalated_at: string | null
          escalated_reason: string | null
          escalated_to_role: Database["public"]["Enums"]["owner_role"] | null
          id: string
          message: string
          org_id: string
          owner_role: Database["public"]["Enums"]["owner_role"]
          required_action: Database["public"]["Enums"]["required_action"]
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["feedback_severity"]
          source_run_id: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          suppressed_at: string | null
          suppressed_reason: string | null
          title: string
          updated_at: string
          venue_id: string
          verification_spec: Json | null
        }
        Insert: {
          assigned_to?: string | null
          business_date: string
          confidence?: number | null
          created_at?: string
          domain: Database["public"]["Enums"]["feedback_domain"]
          due_at?: string | null
          escalated_at?: string | null
          escalated_reason?: string | null
          escalated_to_role?: Database["public"]["Enums"]["owner_role"] | null
          id?: string
          message: string
          org_id: string
          owner_role?: Database["public"]["Enums"]["owner_role"]
          required_action?: Database["public"]["Enums"]["required_action"]
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["feedback_severity"]
          source_run_id?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          suppressed_at?: string | null
          suppressed_reason?: string | null
          title: string
          updated_at?: string
          venue_id: string
          verification_spec?: Json | null
        }
        Update: {
          assigned_to?: string | null
          business_date?: string
          confidence?: number | null
          created_at?: string
          domain?: Database["public"]["Enums"]["feedback_domain"]
          due_at?: string | null
          escalated_at?: string | null
          escalated_reason?: string | null
          escalated_to_role?: Database["public"]["Enums"]["owner_role"] | null
          id?: string
          message?: string
          org_id?: string
          owner_role?: Database["public"]["Enums"]["owner_role"]
          required_action?: Database["public"]["Enums"]["required_action"]
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["feedback_severity"]
          source_run_id?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          suppressed_at?: string | null
          suppressed_reason?: string | null
          title?: string
          updated_at?: string
          venue_id?: string
          verification_spec?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_objects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_objects_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "feedback_objects_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_accuracy_stats: {
        Row: {
          avg_bias: number | null
          day_type: string
          id: string
          last_computed_at: string | null
          mape: number
          sample_end_date: string | null
          sample_size: number
          sample_start_date: string | null
          venue_id: string
          within_10pct: number
          within_20pct: number
        }
        Insert: {
          avg_bias?: number | null
          day_type: string
          id?: string
          last_computed_at?: string | null
          mape?: number
          sample_end_date?: string | null
          sample_size?: number
          sample_start_date?: string | null
          venue_id: string
          within_10pct?: number
          within_20pct?: number
        }
        Update: {
          avg_bias?: number | null
          day_type?: string
          id?: string
          last_computed_at?: string | null
          mape?: number
          sample_end_date?: string | null
          sample_size?: number
          sample_start_date?: string | null
          venue_id?: string
          within_10pct?: number
          within_20pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_accuracy_stats_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "forecast_accuracy_stats_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_bias_adjustments: {
        Row: {
          covers_offset: number
          created_at: string | null
          created_by: string | null
          day_type_offsets: Json | null
          effective_from: string
          effective_to: string | null
          id: string
          reason: string | null
          revenue_offset: number | null
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          covers_offset?: number
          created_at?: string | null
          created_by?: string | null
          day_type_offsets?: Json | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          reason?: string | null
          revenue_offset?: number | null
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          covers_offset?: number
          created_at?: string | null
          created_by?: string | null
          day_type_offsets?: Json | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          reason?: string | null
          revenue_offset?: number | null
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_bias_adjustments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "forecast_bias_adjustments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_layer_outputs: {
        Row: {
          base_forecast: number
          business_date: string
          created_at: string | null
          day_type: string | null
          day_type_offset: number | null
          final_forecast: number
          forecast_generated_at: string | null
          holiday_code: string | null
          holiday_offset: number | null
          hours_to_service: number | null
          id: string
          model_version: string | null
          on_hand_resos: number | null
          pace_ratio: number | null
          pacing_multiplier: number | null
          shift_type: string | null
          typical_on_hand_resos: number | null
          venue_class: string | null
          venue_id: string
        }
        Insert: {
          base_forecast: number
          business_date: string
          created_at?: string | null
          day_type?: string | null
          day_type_offset?: number | null
          final_forecast: number
          forecast_generated_at?: string | null
          holiday_code?: string | null
          holiday_offset?: number | null
          hours_to_service?: number | null
          id?: string
          model_version?: string | null
          on_hand_resos?: number | null
          pace_ratio?: number | null
          pacing_multiplier?: number | null
          shift_type?: string | null
          typical_on_hand_resos?: number | null
          venue_class?: string | null
          venue_id: string
        }
        Update: {
          base_forecast?: number
          business_date?: string
          created_at?: string | null
          day_type?: string | null
          day_type_offset?: number | null
          final_forecast?: number
          forecast_generated_at?: string | null
          holiday_code?: string | null
          holiday_offset?: number | null
          hours_to_service?: number | null
          id?: string
          model_version?: string | null
          on_hand_resos?: number | null
          pace_ratio?: number | null
          pacing_multiplier?: number | null
          shift_type?: string | null
          typical_on_hand_resos?: number | null
          venue_class?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_layer_outputs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "forecast_layer_outputs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_overrides: {
        Row: {
          actual_covers: number | null
          business_date: string
          delta: number | null
          error_model: number | null
          error_override: number | null
          forecast_post_override: number
          forecast_pre_override: number
          id: string
          layer_output_id: string | null
          manager_value_add: number | null
          outcome_recorded_at: string | null
          overridden_at: string | null
          overridden_by: string | null
          reason_code: Database["public"]["Enums"]["override_reason"]
          reason_text: string | null
          shift_type: string | null
          venue_id: string
        }
        Insert: {
          actual_covers?: number | null
          business_date: string
          delta?: number | null
          error_model?: number | null
          error_override?: number | null
          forecast_post_override: number
          forecast_pre_override: number
          id?: string
          layer_output_id?: string | null
          manager_value_add?: number | null
          outcome_recorded_at?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          reason_code: Database["public"]["Enums"]["override_reason"]
          reason_text?: string | null
          shift_type?: string | null
          venue_id: string
        }
        Update: {
          actual_covers?: number | null
          business_date?: string
          delta?: number | null
          error_model?: number | null
          error_override?: number | null
          forecast_post_override?: number
          forecast_pre_override?: number
          id?: string
          layer_output_id?: string | null
          manager_value_add?: number | null
          outcome_recorded_at?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          reason_code?: Database["public"]["Enums"]["override_reason"]
          reason_text?: string | null
          shift_type?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_overrides_layer_output_id_fkey"
            columns: ["layer_output_id"]
            isOneToOne: false
            referencedRelation: "forecast_layer_outputs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_overrides_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "forecast_overrides_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_reviews: {
        Row: {
          business_dates_reviewed: string[]
          created_at: string
          id: string
          review_date: string
          review_time: string
          reviewed_by: string | null
          shifts_reviewed: string[]
          total_adjustments_recommended: number | null
          total_potential_savings: number | null
          venue_id: string
        }
        Insert: {
          business_dates_reviewed: string[]
          created_at?: string
          id?: string
          review_date: string
          review_time?: string
          reviewed_by?: string | null
          shifts_reviewed: string[]
          total_adjustments_recommended?: number | null
          total_potential_savings?: number | null
          venue_id: string
        }
        Update: {
          business_dates_reviewed?: string[]
          created_at?: string
          id?: string
          review_date?: string
          review_time?: string
          reviewed_by?: string | null
          shifts_reviewed?: string[]
          total_adjustments_recommended?: number | null
          total_potential_savings?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "forecast_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_account_category_map: {
        Row: {
          category_id: string
          created_at: string
          gl_account_id: string
          id: string
          org_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          category_id: string
          created_at?: string
          gl_account_id: string
          id?: string
          org_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          gl_account_id?: string
          id?: string
          org_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "gl_account_category_map_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "proforma_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_account_category_map_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_account_category_map_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_accounts: {
        Row: {
          created_at: string
          display_order: number
          external_code: string | null
          id: string
          is_active: boolean
          is_summary: boolean
          name: string
          org_id: string
          section: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          external_code?: string | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          name: string
          org_id: string
          section: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          external_code?: string | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          name?: string
          org_id?: string
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_mapping_feedback: {
        Row: {
          created_at: string | null
          id: string
          invoice_id: string | null
          item_category: string | null
          item_id: string
          item_name: string | null
          organization_id: string
          selected_gl_account_id: string
          suggested_gl_account_id: string | null
          suggestion_confidence: string | null
          suggestion_reason: string | null
          user_id: string | null
          vendor_id: string | null
          was_suggestion_accepted: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          item_category?: string | null
          item_id: string
          item_name?: string | null
          organization_id: string
          selected_gl_account_id: string
          suggested_gl_account_id?: string | null
          suggestion_confidence?: string | null
          suggestion_reason?: string | null
          user_id?: string | null
          vendor_id?: string | null
          was_suggestion_accepted?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          item_category?: string | null
          item_id?: string
          item_name?: string | null
          organization_id?: string
          selected_gl_account_id?: string
          suggested_gl_account_id?: string | null
          suggestion_confidence?: string | null
          suggestion_reason?: string | null
          user_id?: string | null
          vendor_id?: string | null
          was_suggestion_accepted?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "gl_mapping_feedback_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_mapping_feedback_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_mapping_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_mapping_feedback_selected_gl_account_id_fkey"
            columns: ["selected_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_mapping_feedback_suggested_gl_account_id_fkey"
            columns: ["suggested_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_mapping_feedback_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      greeting_metrics: {
        Row: {
          approach_zone_id: string | null
          business_date: string
          created_at: string
          greeted_at: string | null
          greeted_event_id: string | null
          greeting_time_seconds: number | null
          id: string
          seat_zone_id: string
          seated_at: string
          seated_event_id: string
          status: string
          table_name: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          approach_zone_id?: string | null
          business_date: string
          created_at?: string
          greeted_at?: string | null
          greeted_event_id?: string | null
          greeting_time_seconds?: number | null
          id?: string
          seat_zone_id: string
          seated_at: string
          seated_event_id: string
          status?: string
          table_name: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          approach_zone_id?: string | null
          business_date?: string
          created_at?: string
          greeted_at?: string | null
          greeted_event_id?: string | null
          greeting_time_seconds?: number | null
          id?: string
          seat_zone_id?: string
          seated_at?: string
          seated_event_id?: string
          status?: string
          table_name?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "greeting_metrics_approach_zone_id_fkey"
            columns: ["approach_zone_id"]
            isOneToOne: false
            referencedRelation: "table_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greeting_metrics_greeted_event_id_fkey"
            columns: ["greeted_event_id"]
            isOneToOne: false
            referencedRelation: "zone_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greeting_metrics_seat_zone_id_fkey"
            columns: ["seat_zone_id"]
            isOneToOne: false
            referencedRelation: "table_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greeting_metrics_seated_event_id_fkey"
            columns: ["seated_event_id"]
            isOneToOne: false
            referencedRelation: "zone_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "greeting_metrics_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "greeting_metrics_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      greeting_settings: {
        Row: {
          created_at: string
          critical_greeting_seconds: number
          expire_after_seconds: number
          id: string
          is_active: boolean
          polling_interval_seconds: number
          scene_change_threshold: number
          target_greeting_seconds: number
          updated_at: string
          venue_id: string
          vision_max_tokens: number
          vision_model: string
          warning_greeting_seconds: number
        }
        Insert: {
          created_at?: string
          critical_greeting_seconds?: number
          expire_after_seconds?: number
          id?: string
          is_active?: boolean
          polling_interval_seconds?: number
          scene_change_threshold?: number
          target_greeting_seconds?: number
          updated_at?: string
          venue_id: string
          vision_max_tokens?: number
          vision_model?: string
          warning_greeting_seconds?: number
        }
        Update: {
          created_at?: string
          critical_greeting_seconds?: number
          expire_after_seconds?: number
          id?: string
          is_active?: boolean
          polling_interval_seconds?: number
          scene_change_threshold?: number
          target_greeting_seconds?: number
          updated_at?: string
          venue_id?: string
          vision_max_tokens?: number
          vision_model?: string
          warning_greeting_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "greeting_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "greeting_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_adjustments: {
        Row: {
          confidence: string | null
          covers_offset: number
          created_at: string | null
          holiday_code: Database["public"]["Enums"]["holiday_code"]
          id: string
          max_uplift_pct: number | null
          min_floor: number | null
          notes: string | null
          updated_at: string | null
          venue_class: Database["public"]["Enums"]["venue_class"]
        }
        Insert: {
          confidence?: string | null
          covers_offset?: number
          created_at?: string | null
          holiday_code: Database["public"]["Enums"]["holiday_code"]
          id?: string
          max_uplift_pct?: number | null
          min_floor?: number | null
          notes?: string | null
          updated_at?: string | null
          venue_class: Database["public"]["Enums"]["venue_class"]
        }
        Update: {
          confidence?: string | null
          covers_offset?: number
          created_at?: string | null
          holiday_code?: Database["public"]["Enums"]["holiday_code"]
          id?: string
          max_uplift_pct?: number | null
          min_floor?: number | null
          notes?: string | null
          updated_at?: string | null
          venue_class?: Database["public"]["Enums"]["venue_class"]
        }
        Relationships: []
      }
      holiday_calendar: {
        Row: {
          holiday_code: Database["public"]["Enums"]["holiday_code"]
          holiday_date: string
          id: string
          year: number | null
        }
        Insert: {
          holiday_code: Database["public"]["Enums"]["holiday_code"]
          holiday_date: string
          id?: string
          year?: number | null
        }
        Update: {
          holiday_code?: Database["public"]["Enums"]["holiday_code"]
          holiday_date?: string
          id?: string
          year?: number | null
        }
        Relationships: []
      }
      hourly_snapshots: {
        Row: {
          active_covers: number
          active_tables: number
          bartenders_recommended: number | null
          business_date: string
          created_at: string
          day_of_week: number
          departing_covers: number
          hour_slot: number
          id: string
          new_covers: number
          revenue_active: number | null
          servers_recommended: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          active_covers?: number
          active_tables?: number
          bartenders_recommended?: number | null
          business_date: string
          created_at?: string
          day_of_week: number
          departing_covers?: number
          hour_slot: number
          id?: string
          new_covers?: number
          revenue_active?: number | null
          servers_recommended?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          active_covers?: number
          active_tables?: number
          bartenders_recommended?: number | null
          business_date?: string
          created_at?: string
          day_of_week?: number
          departing_covers?: number
          hour_slot?: number
          id?: string
          new_covers?: number
          revenue_active?: number | null
          servers_recommended?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hourly_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "hourly_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      http_idempotency: {
        Row: {
          created_at: string | null
          key: string
          response: Json
          status: number
        }
        Insert: {
          created_at?: string | null
          key: string
          response: Json
          status: number
        }
        Update: {
          created_at?: string | null
          key?: string
          response?: Json
          status?: number
        }
        Relationships: []
      }
      inventory_balances: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          last_cost: number | null
          last_received_at: string | null
          last_updated_at: string | null
          quantity_on_hand: number | null
          unit_of_measure: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          last_cost?: number | null
          last_received_at?: string | null
          last_updated_at?: string | null
          quantity_on_hand?: number | null
          unit_of_measure: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          last_cost?: number | null
          last_received_at?: string | null
          last_updated_at?: string | null
          quantity_on_hand?: number | null
          unit_of_measure?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "inventory_balances_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_lines: {
        Row: {
          count_id: string
          counted_at: string | null
          id: string
          item_id: string
          line_total: number | null
          notes: string | null
          quantity_counted: number
          unit_cost: number | null
          unit_of_measure: string
        }
        Insert: {
          count_id: string
          counted_at?: string | null
          id?: string
          item_id: string
          line_total?: number | null
          notes?: string | null
          quantity_counted: number
          unit_cost?: number | null
          unit_of_measure: string
        }
        Update: {
          count_id?: string
          counted_at?: string | null
          id?: string
          item_id?: string
          line_total?: number | null
          notes?: string | null
          quantity_counted?: number
          unit_cost?: number | null
          unit_of_measure?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_lines_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          count_date: string
          count_type: string
          counted_by: string | null
          created_at: string | null
          id: string
          notes: string | null
          status: string
          venue_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          count_date: string
          count_type: string
          counted_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          venue_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          count_date?: string
          count_type?: string
          counted_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "inventory_counts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "inventory_locations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_period_snapshots: {
        Row: {
          actual_usage: number | null
          beginning_inventory: number
          created_at: string | null
          ending_inventory: number
          id: string
          period_end: string
          period_start: string
          purchases: number
          theoretical_usage: number | null
          variance_dollars: number | null
          venue_id: string
        }
        Insert: {
          actual_usage?: number | null
          beginning_inventory: number
          created_at?: string | null
          ending_inventory: number
          id?: string
          period_end: string
          period_start: string
          purchases: number
          theoretical_usage?: number | null
          variance_dollars?: number | null
          venue_id: string
        }
        Update: {
          actual_usage?: number | null
          beginning_inventory?: number
          created_at?: string | null
          ending_inventory?: number
          id?: string
          period_end?: string
          period_start?: string
          purchases?: number
          theoretical_usage?: number | null
          variance_dollars?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_period_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "inventory_period_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_scale_readings: {
        Row: {
          abv_percent: number | null
          captured_at: string
          captured_by: string
          computed_from: string
          count_session_id: string
          est_remaining_ml: number
          fill_ratio: number
          id: string
          meta: Json | null
          sku_id: string
          used_empty_g: number | null
          used_full_g: number | null
          venue_id: string
          weight_g: number
        }
        Insert: {
          abv_percent?: number | null
          captured_at?: string
          captured_by: string
          computed_from: string
          count_session_id: string
          est_remaining_ml: number
          fill_ratio: number
          id?: string
          meta?: Json | null
          sku_id: string
          used_empty_g?: number | null
          used_full_g?: number | null
          venue_id: string
          weight_g: number
        }
        Update: {
          abv_percent?: number | null
          captured_at?: string
          captured_by?: string
          computed_from?: string
          count_session_id?: string
          est_remaining_ml?: number
          fill_ratio?: number
          id?: string
          meta?: Json | null
          sku_id?: string
          used_empty_g?: number | null
          used_full_g?: number | null
          venue_id?: string
          weight_g?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_scale_readings_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_scale_readings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "inventory_scale_readings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          item_id: string
          notes: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
          unit_cost: number | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
          unit_cost?: number | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
          unit_cost?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "inventory_transactions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          catch_weight: number | null
          created_at: string | null
          department_id: string | null
          description: string
          gl_code: string | null
          id: string
          invoice_id: string
          is_ignored: boolean
          is_preopening: boolean
          item_id: string | null
          line_total: number | null
          nominal_case_weight: number | null
          normalized_description: string | null
          notes: string | null
          ocr_confidence: number | null
          parsed_pack: Json | null
          piece_count: number | null
          product_specs: Json | null
          qty: number
          unit_cost: number
          vendor_item_code: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          catch_weight?: number | null
          created_at?: string | null
          department_id?: string | null
          description: string
          gl_code?: string | null
          id?: string
          invoice_id: string
          is_ignored?: boolean
          is_preopening?: boolean
          item_id?: string | null
          line_total?: number | null
          nominal_case_weight?: number | null
          normalized_description?: string | null
          notes?: string | null
          ocr_confidence?: number | null
          parsed_pack?: Json | null
          piece_count?: number | null
          product_specs?: Json | null
          qty: number
          unit_cost: number
          vendor_item_code?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          catch_weight?: number | null
          created_at?: string | null
          department_id?: string | null
          description?: string
          gl_code?: string | null
          id?: string
          invoice_id?: string
          is_ignored?: boolean
          is_preopening?: boolean
          item_id?: string | null
          line_total?: number | null
          nominal_case_weight?: number | null
          normalized_description?: string | null
          notes?: string | null
          ocr_confidence?: number | null
          parsed_pack?: Json | null
          piece_count?: number | null
          product_specs?: Json | null
          qty?: number
          unit_cost?: number
          vendor_item_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_variances: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          invoice_id: string
          line_count: number | null
          receipt_id: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["variance_severity"]
          total_variance_amount: number | null
          variance_pct: number | null
          variance_type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          invoice_id: string
          line_count?: number | null
          receipt_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: Database["public"]["Enums"]["variance_severity"]
          total_variance_amount?: number | null
          variance_pct?: number | null
          variance_type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          invoice_id?: string
          line_count?: number | null
          receipt_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["variance_severity"]
          total_variance_amount?: number | null
          variance_pct?: number | null
          variance_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_variances_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_variances_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_variances_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "three_way_match"
            referencedColumns: ["receipt_id"]
          },
        ]
      }
      invoices: {
        Row: {
          auto_approved: boolean | null
          created_at: string | null
          created_by: string | null
          due_date: string | null
          id: string
          image_url: string | null
          invoice_date: string
          invoice_number: string | null
          is_preopening: boolean
          match_confidence:
            | Database["public"]["Enums"]["match_confidence"]
            | null
          ocr_confidence: number | null
          ocr_raw_json: Json | null
          organization_id: string
          payment_terms: string | null
          po_number_ocr: string | null
          preopening_category_id: string | null
          purchase_order_id: string | null
          r365_export_batch_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          storage_path: string | null
          total_amount: number | null
          total_variance_pct: number | null
          updated_at: string | null
          variance_severity:
            | Database["public"]["Enums"]["variance_severity"]
            | null
          vendor_id: string
          venue_id: string
        }
        Insert: {
          auto_approved?: boolean | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string
          image_url?: string | null
          invoice_date: string
          invoice_number?: string | null
          is_preopening?: boolean
          match_confidence?:
            | Database["public"]["Enums"]["match_confidence"]
            | null
          ocr_confidence?: number | null
          ocr_raw_json?: Json | null
          organization_id: string
          payment_terms?: string | null
          po_number_ocr?: string | null
          preopening_category_id?: string | null
          purchase_order_id?: string | null
          r365_export_batch_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          storage_path?: string | null
          total_amount?: number | null
          total_variance_pct?: number | null
          updated_at?: string | null
          variance_severity?:
            | Database["public"]["Enums"]["variance_severity"]
            | null
          vendor_id: string
          venue_id: string
        }
        Update: {
          auto_approved?: boolean | null
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          id?: string
          image_url?: string | null
          invoice_date?: string
          invoice_number?: string | null
          is_preopening?: boolean
          match_confidence?:
            | Database["public"]["Enums"]["match_confidence"]
            | null
          ocr_confidence?: number | null
          ocr_raw_json?: Json | null
          organization_id?: string
          payment_terms?: string | null
          po_number_ocr?: string | null
          preopening_category_id?: string | null
          purchase_order_id?: string | null
          r365_export_batch_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          storage_path?: string | null
          total_amount?: number | null
          total_variance_pct?: number | null
          updated_at?: string | null
          variance_severity?:
            | Database["public"]["Enums"]["variance_severity"]
            | null
          vendor_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_preopening_category_id_fkey"
            columns: ["preopening_category_id"]
            isOneToOne: false
            referencedRelation: "proforma_preopening_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "three_way_match"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "invoices_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      item_cost_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_date: string
          id: string
          item_id: string
          source: string | null
          unit_cost: number
          venue_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_date: string
          id?: string
          item_id: string
          source?: string | null
          unit_cost: number
          venue_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_date?: string
          id?: string
          item_id?: string
          source?: string | null
          unit_cost?: number
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_cost_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_cost_history_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "item_cost_history_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      item_day_facts: {
        Row: {
          business_date: string
          category: string | null
          comps_total: number | null
          created_at: string | null
          etl_run_id: string | null
          gross_sales: number
          id: string
          last_synced_at: string
          menu_item_name: string
          net_sales: number
          parent_category: string | null
          quantity_sold: number
          venue_id: string
          voids_total: number | null
        }
        Insert: {
          business_date: string
          category?: string | null
          comps_total?: number | null
          created_at?: string | null
          etl_run_id?: string | null
          gross_sales?: number
          id?: string
          last_synced_at?: string
          menu_item_name: string
          net_sales?: number
          parent_category?: string | null
          quantity_sold?: number
          venue_id: string
          voids_total?: number | null
        }
        Update: {
          business_date?: string
          category?: string | null
          comps_total?: number | null
          created_at?: string | null
          etl_run_id?: string | null
          gross_sales?: number
          id?: string
          last_synced_at?: string
          menu_item_name?: string
          net_sales?: number
          parent_category?: string | null
          quantity_sold?: number
          venue_id?: string
          voids_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_day_facts_etl_run_id_fkey"
            columns: ["etl_run_id"]
            isOneToOne: false
            referencedRelation: "etl_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "item_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      item_pack_configurations: {
        Row: {
          conversion_factor: number
          created_at: string | null
          display_name: string | null
          id: string
          is_active: boolean | null
          item_id: string
          pack_type: string
          unit_size: number
          unit_size_uom: string
          units_per_pack: number
          updated_at: string | null
          vendor_id: string | null
          vendor_item_code: string | null
        }
        Insert: {
          conversion_factor: number
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          item_id: string
          pack_type: string
          unit_size: number
          unit_size_uom: string
          units_per_pack?: number
          updated_at?: string | null
          vendor_id?: string | null
          vendor_item_code?: string | null
        }
        Update: {
          conversion_factor?: number
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean | null
          item_id?: string
          pack_type?: string
          unit_size?: number
          unit_size_uom?: string
          units_per_pack?: number
          updated_at?: string | null
          vendor_id?: string | null
          vendor_item_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_pack_configurations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_pack_configurations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      item_pars: {
        Row: {
          created_at: string
          id: string
          item_id: string
          max_level: number | null
          notes: string | null
          par_level: number
          reorder_point: number
          reorder_quantity: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          max_level?: number | null
          notes?: string | null
          par_level?: number
          reorder_point?: number
          reorder_quantity?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          max_level?: number | null
          notes?: string | null
          par_level?: number
          reorder_point?: number
          reorder_quantity?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_pars_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_pars_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "item_pars_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          base_uom: string
          category: string
          ceiling_margin_pct: number | null
          created_at: string | null
          floor_margin_pct: number | null
          gl_account_id: string | null
          id: string
          is_active: boolean | null
          item_type: string | null
          name: string
          organization_id: string
          r365_cost_account: string | null
          r365_cost_update_method: string | null
          r365_inventory_account: string | null
          r365_inventory_uom: string | null
          r365_key_item: boolean | null
          r365_measure_type: string | null
          r365_reporting_uom: string | null
          sku: string
          subcategory: string | null
          target_margin_pct: number | null
          updated_at: string | null
        }
        Insert: {
          base_uom: string
          category: string
          ceiling_margin_pct?: number | null
          created_at?: string | null
          floor_margin_pct?: number | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean | null
          item_type?: string | null
          name: string
          organization_id: string
          r365_cost_account?: string | null
          r365_cost_update_method?: string | null
          r365_inventory_account?: string | null
          r365_inventory_uom?: string | null
          r365_key_item?: boolean | null
          r365_measure_type?: string | null
          r365_reporting_uom?: string | null
          sku: string
          subcategory?: string | null
          target_margin_pct?: number | null
          updated_at?: string | null
        }
        Update: {
          base_uom?: string
          category?: string
          ceiling_margin_pct?: number | null
          created_at?: string | null
          floor_margin_pct?: number | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean | null
          item_type?: string | null
          name?: string
          organization_id?: string
          r365_cost_account?: string | null
          r365_cost_update_method?: string | null
          r365_inventory_account?: string | null
          r365_inventory_uom?: string | null
          r365_key_item?: boolean | null
          r365_measure_type?: string | null
          r365_reporting_uom?: string | null
          sku?: string
          subcategory?: string | null
          target_margin_pct?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_day_facts: {
        Row: {
          boh_cost: number | null
          boh_employee_count: number | null
          boh_hours: number | null
          business_date: string
          covers: number | null
          covers_per_labor_hour: number | null
          created_at: string | null
          employee_count: number
          etl_run_id: string | null
          foh_cost: number | null
          foh_employee_count: number | null
          foh_hours: number | null
          id: string
          labor_cost: number
          labor_pct: number | null
          last_synced_at: string | null
          net_sales: number | null
          ot_hours: number
          other_cost: number | null
          other_employee_count: number | null
          other_hours: number | null
          punch_count: number
          splh: number | null
          total_hours: number
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          boh_cost?: number | null
          boh_employee_count?: number | null
          boh_hours?: number | null
          business_date: string
          covers?: number | null
          covers_per_labor_hour?: number | null
          created_at?: string | null
          employee_count?: number
          etl_run_id?: string | null
          foh_cost?: number | null
          foh_employee_count?: number | null
          foh_hours?: number | null
          id?: string
          labor_cost?: number
          labor_pct?: number | null
          last_synced_at?: string | null
          net_sales?: number | null
          ot_hours?: number
          other_cost?: number | null
          other_employee_count?: number | null
          other_hours?: number | null
          punch_count?: number
          splh?: number | null
          total_hours?: number
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          boh_cost?: number | null
          boh_employee_count?: number | null
          boh_hours?: number | null
          business_date?: string
          covers?: number | null
          covers_per_labor_hour?: number | null
          created_at?: string | null
          employee_count?: number
          etl_run_id?: string | null
          foh_cost?: number | null
          foh_employee_count?: number | null
          foh_hours?: number | null
          id?: string
          labor_cost?: number
          labor_pct?: number | null
          last_synced_at?: string | null
          net_sales?: number | null
          ot_hours?: number
          other_cost?: number | null
          other_employee_count?: number | null
          other_hours?: number | null
          punch_count?: number
          splh?: number | null
          total_hours?: number
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_day_facts_etl_run_id_fkey"
            columns: ["etl_run_id"]
            isOneToOne: false
            referencedRelation: "etl_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "labor_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_exceptions: {
        Row: {
          actual_value: number
          business_date: string
          created_at: string
          diagnostic: string
          exception_type: string
          expected_value: number
          message: string
          severity: string
          updated_at: string
          variance_pct: number
          venue_id: string
        }
        Insert: {
          actual_value: number
          business_date: string
          created_at?: string
          diagnostic: string
          exception_type: string
          expected_value: number
          message: string
          severity: string
          updated_at?: string
          variance_pct: number
          venue_id: string
        }
        Update: {
          actual_value?: number
          business_date?: string
          created_at?: string
          diagnostic?: string
          exception_type?: string
          expected_value?: number
          message?: string
          severity?: string
          updated_at?: string
          variance_pct?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_exceptions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "labor_exceptions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_optimization_settings: {
        Row: {
          auto_optimize_threshold: number | null
          cost_weight: number | null
          created_at: string
          efficiency_weight: number | null
          id: string
          is_active: boolean | null
          max_labor_percentage: number
          min_labor_percentage: number
          monthly_margin_improvement_target: number | null
          optimization_mode: string
          quality_weight: number | null
          require_manager_approval: boolean | null
          target_labor_percentage: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          auto_optimize_threshold?: number | null
          cost_weight?: number | null
          created_at?: string
          efficiency_weight?: number | null
          id?: string
          is_active?: boolean | null
          max_labor_percentage?: number
          min_labor_percentage?: number
          monthly_margin_improvement_target?: number | null
          optimization_mode?: string
          quality_weight?: number | null
          require_manager_approval?: boolean | null
          target_labor_percentage?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          auto_optimize_threshold?: number | null
          cost_weight?: number | null
          created_at?: string
          efficiency_weight?: number | null
          id?: string
          is_active?: boolean | null
          max_labor_percentage?: number
          min_labor_percentage?: number
          monthly_margin_improvement_target?: number | null
          optimization_mode?: string
          quality_weight?: number | null
          require_manager_approval?: boolean | null
          target_labor_percentage?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_optimization_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "labor_optimization_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_requirements: {
        Row: {
          avg_hourly_rate: number | null
          business_date: string
          calculation_method: string | null
          covers_per_labor_hour: number | null
          created_at: string
          employees_needed: number
          forecast_id: string
          hours_per_employee: number
          id: string
          labor_percentage: number | null
          optimization_priority: number | null
          position: string
          position_id: string | null
          quality_adjusted_cost: number | null
          service_quality_score: number | null
          shift_type: string
          staffing_pattern_id: string | null
          total_cost: number | null
          total_hours: number
          venue_id: string
          within_target: boolean | null
        }
        Insert: {
          avg_hourly_rate?: number | null
          business_date: string
          calculation_method?: string | null
          covers_per_labor_hour?: number | null
          created_at?: string
          employees_needed: number
          forecast_id: string
          hours_per_employee: number
          id?: string
          labor_percentage?: number | null
          optimization_priority?: number | null
          position: string
          position_id?: string | null
          quality_adjusted_cost?: number | null
          service_quality_score?: number | null
          shift_type: string
          staffing_pattern_id?: string | null
          total_cost?: number | null
          total_hours: number
          venue_id: string
          within_target?: boolean | null
        }
        Update: {
          avg_hourly_rate?: number | null
          business_date?: string
          calculation_method?: string | null
          covers_per_labor_hour?: number | null
          created_at?: string
          employees_needed?: number
          forecast_id?: string
          hours_per_employee?: number
          id?: string
          labor_percentage?: number | null
          optimization_priority?: number | null
          position?: string
          position_id?: string | null
          quality_adjusted_cost?: number | null
          service_quality_score?: number | null
          shift_type?: string
          staffing_pattern_id?: string | null
          total_cost?: number | null
          total_hours?: number
          venue_id?: string
          within_target?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "labor_requirements_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "demand_forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_requirements_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "forecasts_with_bias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_requirements_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "cplh_by_position_shift"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "labor_requirements_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_requirements_staffing_pattern_id_fkey"
            columns: ["staffing_pattern_id"]
            isOneToOne: false
            referencedRelation: "staffing_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_requirements_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "labor_requirements_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_targets: {
        Row: {
          created_at: string
          day_of_week: number | null
          effective_from: string
          effective_until: string | null
          id: string
          is_active: boolean | null
          max_labor_percentage: number
          min_labor_percentage: number
          shift_type: string | null
          target_labor_percentage: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          max_labor_percentage?: number
          min_labor_percentage?: number
          shift_type?: string | null
          target_labor_percentage?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          max_labor_percentage?: number
          min_labor_percentage?: number
          shift_type?: string | null
          target_labor_percentage?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "labor_targets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "labor_targets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      location_config: {
        Row: {
          avg_hourly_rate: number | null
          avg_revenue_per_cover: number | null
          buffer_pct: number
          close_hour: number
          closed_weekdays: number[] | null
          covers_per_bartender_target: number
          covers_per_server_target: number
          created_at: string
          default_dwell_minutes: number | null
          id: string
          is_active: boolean | null
          min_bartenders: number
          min_servers: number
          open_hour: number
          peak_buffer_pct: number | null
          peak_days: number[] | null
          pos_config: Json | null
          pos_type: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          avg_hourly_rate?: number | null
          avg_revenue_per_cover?: number | null
          buffer_pct?: number
          close_hour?: number
          closed_weekdays?: number[] | null
          covers_per_bartender_target?: number
          covers_per_server_target?: number
          created_at?: string
          default_dwell_minutes?: number | null
          id?: string
          is_active?: boolean | null
          min_bartenders?: number
          min_servers?: number
          open_hour?: number
          peak_buffer_pct?: number | null
          peak_days?: number[] | null
          pos_config?: Json | null
          pos_type?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          avg_hourly_rate?: number | null
          avg_revenue_per_cover?: number | null
          buffer_pct?: number
          close_hour?: number
          closed_weekdays?: number[] | null
          covers_per_bartender_target?: number
          covers_per_server_target?: number
          created_at?: string
          default_dwell_minutes?: number | null
          id?: string
          is_active?: boolean | null
          min_bartenders?: number
          min_servers?: number
          open_hour?: number
          peak_buffer_pct?: number | null
          peak_days?: number[] | null
          pos_config?: Json | null
          pos_type?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "location_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_actions: {
        Row: {
          action: string
          assigned_role: string | null
          assigned_to: string | null
          attestation_id: string | null
          business_date: string
          category: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          created_at: string | null
          description: string
          escalated_at: string | null
          escalated_to: string | null
          escalation_reason: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          priority: string
          related_checks: Json | null
          related_employees: Json | null
          source_data: Json | null
          source_report: string
          source_type: string
          status: string
          title: string
          updated_at: string | null
          venue_id: string | null
        }
        Insert: {
          action: string
          assigned_role?: string | null
          assigned_to?: string | null
          attestation_id?: string | null
          business_date: string
          category: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description: string
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          priority: string
          related_checks?: Json | null
          related_employees?: Json | null
          source_data?: Json | null
          source_report: string
          source_type?: string
          status?: string
          title: string
          updated_at?: string | null
          venue_id?: string | null
        }
        Update: {
          action?: string
          assigned_role?: string | null
          assigned_to?: string | null
          attestation_id?: string | null
          business_date?: string
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description?: string
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          priority?: string
          related_checks?: Json | null
          related_employees?: Json | null
          source_data?: Json | null
          source_report?: string
          source_type?: string
          status?: string
          title?: string
          updated_at?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_actions_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "nightly_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_actions_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "pending_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "manager_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_feedback: {
        Row: {
          business_date: string | null
          created_at: string
          feedback_type: string
          id: string
          manager_decision: string | null
          manager_id: string
          original_recommendation: string | null
          outcome_notes: string | null
          outcome_success: boolean | null
          reason: string | null
          related_adjustment_id: string | null
          related_forecast_id: string | null
          venue_id: string
        }
        Insert: {
          business_date?: string | null
          created_at?: string
          feedback_type: string
          id?: string
          manager_decision?: string | null
          manager_id: string
          original_recommendation?: string | null
          outcome_notes?: string | null
          outcome_success?: boolean | null
          reason?: string | null
          related_adjustment_id?: string | null
          related_forecast_id?: string | null
          venue_id: string
        }
        Update: {
          business_date?: string | null
          created_at?: string
          feedback_type?: string
          id?: string
          manager_decision?: string | null
          manager_id?: string
          original_recommendation?: string | null
          outcome_notes?: string | null
          outcome_success?: boolean | null
          reason?: string | null
          related_adjustment_id?: string | null
          related_forecast_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_feedback_related_adjustment_id_fkey"
            columns: ["related_adjustment_id"]
            isOneToOne: false
            referencedRelation: "schedule_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_feedback_related_forecast_id_fkey"
            columns: ["related_forecast_id"]
            isOneToOne: false
            referencedRelation: "demand_forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_feedback_related_forecast_id_fkey"
            columns: ["related_forecast_id"]
            isOneToOne: false
            referencedRelation: "forecasts_with_bias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_feedback_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "manager_feedback_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_logbook: {
        Row: {
          author_id: string
          business_date: string
          content: string
          created_at: string
          entry_type: string
          followed_up_at: string | null
          followed_up_by: string | null
          id: string
          priority: string | null
          requires_follow_up: boolean | null
          shift_type: string
          title: string
          updated_at: string
          venue_id: string
          visible_to_all: boolean | null
        }
        Insert: {
          author_id: string
          business_date: string
          content: string
          created_at?: string
          entry_type: string
          followed_up_at?: string | null
          followed_up_by?: string | null
          id?: string
          priority?: string | null
          requires_follow_up?: boolean | null
          shift_type: string
          title: string
          updated_at?: string
          venue_id: string
          visible_to_all?: boolean | null
        }
        Update: {
          author_id?: string
          business_date?: string
          content?: string
          created_at?: string
          entry_type?: string
          followed_up_at?: string | null
          followed_up_by?: string | null
          id?: string
          priority?: string | null
          requires_follow_up?: boolean | null
          shift_type?: string
          title?: string
          updated_at?: string
          venue_id?: string
          visible_to_all?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_logbook_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_logbook_followed_up_by_fkey"
            columns: ["followed_up_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_logbook_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "manager_logbook_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      margin_improvement_tracking: {
        Row: {
          avg_service_quality_score: number | null
          baseline_cplh: number
          baseline_labor_cost: number
          baseline_labor_percentage: number
          baseline_revenue: number
          cost_savings: number | null
          cplh_improvement: number | null
          created_at: string
          current_cplh: number
          current_labor_cost: number
          current_labor_percentage: number
          current_revenue: number
          id: string
          labor_pct_improvement: number | null
          margin_improvement: number | null
          optimization_time_invested_hours: number | null
          quality_score_change: number | null
          roi_percentage: number | null
          tracking_period_end: string
          tracking_period_start: string
          venue_id: string
        }
        Insert: {
          avg_service_quality_score?: number | null
          baseline_cplh: number
          baseline_labor_cost: number
          baseline_labor_percentage: number
          baseline_revenue: number
          cost_savings?: number | null
          cplh_improvement?: number | null
          created_at?: string
          current_cplh: number
          current_labor_cost: number
          current_labor_percentage: number
          current_revenue: number
          id?: string
          labor_pct_improvement?: number | null
          margin_improvement?: number | null
          optimization_time_invested_hours?: number | null
          quality_score_change?: number | null
          roi_percentage?: number | null
          tracking_period_end: string
          tracking_period_start: string
          venue_id: string
        }
        Update: {
          avg_service_quality_score?: number | null
          baseline_cplh?: number
          baseline_labor_cost?: number
          baseline_labor_percentage?: number
          baseline_revenue?: number
          cost_savings?: number | null
          cplh_improvement?: number | null
          created_at?: string
          current_cplh?: number
          current_labor_cost?: number
          current_labor_percentage?: number
          current_revenue?: number
          id?: string
          labor_pct_improvement?: number | null
          margin_improvement?: number | null
          optimization_time_invested_hours?: number | null
          quality_score_change?: number | null
          roi_percentage?: number | null
          tracking_period_end?: string
          tracking_period_start?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "margin_improvement_tracking_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "margin_improvement_tracking_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_recipes: {
        Row: {
          id: string
          menu_item_id: string
          portion_multiplier: number | null
          recipe_id: string
        }
        Insert: {
          id?: string
          menu_item_id: string
          portion_multiplier?: number | null
          recipe_id: string
        }
        Update: {
          id?: string
          menu_item_id?: string
          portion_multiplier?: number | null
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_cost_rollup"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category: string | null
          created_at: string | null
          external_id: string
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          external_id: string
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          external_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "menu_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      message_channels: {
        Row: {
          channel_type: string
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          id: string
          is_archived: boolean | null
          is_muted: boolean | null
          is_private: boolean | null
          last_message_at: string | null
          message_count: number | null
          name: string | null
          participant_ids: string[] | null
          shift_type: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          channel_type: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_muted?: boolean | null
          is_private?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          name?: string | null
          participant_ids?: string[] | null
          shift_type?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          channel_type?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_muted?: boolean | null
          is_private?: boolean | null
          last_message_at?: string | null
          message_count?: number | null
          name?: string | null
          participant_ids?: string[] | null
          shift_type?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_channels_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "message_channels_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      message_read_receipts: {
        Row: {
          employee_id: string
          id: string
          message_id: string
          read_at: string
        }
        Insert: {
          employee_id: string
          id?: string
          message_id: string
          read_at?: string
        }
        Update: {
          employee_id?: string
          id?: string
          message_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_receipts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          announcement_priority: string | null
          announcement_read_by: string[] | null
          attachment_name: string | null
          attachment_type: string | null
          attachment_url: string | null
          channel_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_announcement: boolean | null
          is_deleted: boolean | null
          is_edited: boolean | null
          is_pinned: boolean | null
          mentioned_employee_ids: string[] | null
          mentioned_roles: string[] | null
          message_text: string
          message_type: string
          pinned_at: string | null
          pinned_by: string | null
          reactions: Json | null
          reply_to_message_id: string | null
          sender_id: string
          thread_count: number | null
          updated_at: string
        }
        Insert: {
          announcement_priority?: string | null
          announcement_read_by?: string[] | null
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          channel_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_announcement?: boolean | null
          is_deleted?: boolean | null
          is_edited?: boolean | null
          is_pinned?: boolean | null
          mentioned_employee_ids?: string[] | null
          mentioned_roles?: string[] | null
          message_text: string
          message_type?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reactions?: Json | null
          reply_to_message_id?: string | null
          sender_id: string
          thread_count?: number | null
          updated_at?: string
        }
        Update: {
          announcement_priority?: string | null
          announcement_read_by?: string[] | null
          attachment_name?: string | null
          attachment_type?: string | null
          attachment_url?: string | null
          channel_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_announcement?: boolean | null
          is_deleted?: boolean | null
          is_edited?: boolean | null
          is_pinned?: boolean | null
          mentioned_employee_ids?: string[] | null
          mentioned_roles?: string[] | null
          message_text?: string
          message_type?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reactions?: Json | null
          reply_to_message_id?: string | null
          sender_id?: string
          thread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "message_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      nightly_attestations: {
        Row: {
          amended_at: string | null
          amended_by: string | null
          amendment_reason: string | null
          business_date: string
          comp_violation_count: number | null
          created_at: string | null
          critical_incident_count: number | null
          has_violations: boolean | null
          id: string
          labor_confirmed: boolean | null
          labor_notes: string | null
          labor_variance_reason: string | null
          locked_at: string | null
          locked_by: string | null
          requires_escalation: boolean | null
          revenue_confirmed: boolean | null
          revenue_notes: string | null
          revenue_variance_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          triggers_snapshot: Json | null
          updated_at: string | null
          venue_id: string
          violation_count: number | null
        }
        Insert: {
          amended_at?: string | null
          amended_by?: string | null
          amendment_reason?: string | null
          business_date: string
          comp_violation_count?: number | null
          created_at?: string | null
          critical_incident_count?: number | null
          has_violations?: boolean | null
          id?: string
          labor_confirmed?: boolean | null
          labor_notes?: string | null
          labor_variance_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          requires_escalation?: boolean | null
          revenue_confirmed?: boolean | null
          revenue_notes?: string | null
          revenue_variance_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          triggers_snapshot?: Json | null
          updated_at?: string | null
          venue_id: string
          violation_count?: number | null
        }
        Update: {
          amended_at?: string | null
          amended_by?: string | null
          amendment_reason?: string | null
          business_date?: string
          comp_violation_count?: number | null
          created_at?: string | null
          critical_incident_count?: number | null
          has_violations?: boolean | null
          id?: string
          labor_confirmed?: boolean | null
          labor_notes?: string | null
          labor_variance_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          requires_escalation?: boolean | null
          revenue_confirmed?: boolean | null
          revenue_notes?: string | null
          revenue_variance_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          triggers_snapshot?: Json | null
          updated_at?: string | null
          venue_id?: string
          violation_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nightly_attestations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "nightly_attestations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      nightly_incidents: {
        Row: {
          attestation_id: string
          business_date: string
          created_at: string | null
          description: string
          follow_up_required: boolean | null
          id: string
          incident_type: string
          requires_escalation: boolean | null
          resolution: string | null
          resolved: boolean | null
          severity: string
          staff_involved: string[] | null
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          attestation_id: string
          business_date: string
          created_at?: string | null
          description: string
          follow_up_required?: boolean | null
          id?: string
          incident_type: string
          requires_escalation?: boolean | null
          resolution?: string | null
          resolved?: boolean | null
          severity?: string
          staff_involved?: string[] | null
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          attestation_id?: string
          business_date?: string
          created_at?: string | null
          description?: string
          follow_up_required?: boolean | null
          id?: string
          incident_type?: string
          requires_escalation?: boolean | null
          resolution?: string | null
          resolved?: boolean | null
          severity?: string
          staff_involved?: string[] | null
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nightly_incidents_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "nightly_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nightly_incidents_attestation_id_fkey"
            columns: ["attestation_id"]
            isOneToOne: false
            referencedRelation: "pending_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nightly_incidents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "nightly_incidents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      nightly_log_highlights: {
        Row: {
          amount: number | null
          created_at: string | null
          description: string
          guest_name: string | null
          highlight_type: string
          id: string
          nightly_log_id: string
          table_number: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          description: string
          guest_name?: string | null
          highlight_type: string
          id?: string
          nightly_log_id: string
          table_number?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          description?: string
          guest_name?: string | null
          highlight_type?: string
          id?: string
          nightly_log_id?: string
          table_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nightly_log_highlights_nightly_log_id_fkey"
            columns: ["nightly_log_id"]
            isOneToOne: false
            referencedRelation: "nightly_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      nightly_logs: {
        Row: {
          created_at: string | null
          created_by: string | null
          dj_name: string | null
          guest_count: number | null
          guest_feedback: string | null
          id: string
          incidents: string | null
          labor_notes: string | null
          live_performer: string | null
          log_date: string
          manager_notes: string | null
          music_details: string | null
          music_type: Database["public"]["Enums"]["music_type"] | null
          staff_on_shift: string | null
          table_turns: number | null
          total_checks: number | null
          total_comps: number | null
          total_revenue: number | null
          total_tax: number | null
          total_voids: number | null
          updated_at: string | null
          updated_by: string | null
          venue_id: string
          weather_notes: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          dj_name?: string | null
          guest_count?: number | null
          guest_feedback?: string | null
          id?: string
          incidents?: string | null
          labor_notes?: string | null
          live_performer?: string | null
          log_date: string
          manager_notes?: string | null
          music_details?: string | null
          music_type?: Database["public"]["Enums"]["music_type"] | null
          staff_on_shift?: string | null
          table_turns?: number | null
          total_checks?: number | null
          total_comps?: number | null
          total_revenue?: number | null
          total_tax?: number | null
          total_voids?: number | null
          updated_at?: string | null
          updated_by?: string | null
          venue_id: string
          weather_notes?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          dj_name?: string | null
          guest_count?: number | null
          guest_feedback?: string | null
          id?: string
          incidents?: string | null
          labor_notes?: string | null
          live_performer?: string | null
          log_date?: string
          manager_notes?: string | null
          music_details?: string | null
          music_type?: Database["public"]["Enums"]["music_type"] | null
          staff_on_shift?: string | null
          table_turns?: number | null
          total_checks?: number | null
          total_comps?: number | null
          total_revenue?: number | null
          total_tax?: number | null
          total_voids?: number | null
          updated_at?: string | null
          updated_by?: string | null
          venue_id?: string
          weather_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nightly_logs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "nightly_logs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          channel_id: string | null
          created_at: string
          employee_id: string
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          message_id: string | null
          notification_type: string
          read_at: string | null
          sender_id: string | null
          title: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          channel_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message_id?: string | null
          notification_type: string
          read_at?: string | null
          sender_id?: string | null
          title: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          channel_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message_id?: string | null
          notification_type?: string
          read_at?: string | null
          sender_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "message_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_standards: {
        Row: {
          comp_ai_max_tokens: number
          comp_ai_model: string
          comp_ai_temperature: number
          comp_approved_reasons: Json
          comp_daily_pct_critical: number
          comp_daily_pct_warning: number
          comp_high_pct_threshold: number
          comp_high_value_threshold: number
          comp_manager_min_high_value: number
          comp_manager_roles: string[]
          comp_server_max_amount: number
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          is_active: boolean
          labor_cplh_target: number
          labor_cplh_tolerance: number
          labor_excluded_roles: string[]
          labor_ot_critical_threshold: number
          labor_ot_warning_threshold: number
          labor_pct_tolerance: number
          labor_splh_floor: number
          labor_target_pct: number
          org_id: string
          revenue_avg_cover_ceiling: number | null
          revenue_avg_cover_floor: number | null
          revenue_bev_mix_target: number | null
          revenue_bev_mix_tolerance: number | null
          revenue_cover_drop_critical: number | null
          revenue_cover_drop_warning: number | null
          revenue_promo_tags: string[] | null
          superseded_by_org_id: string | null
          superseded_by_version: number | null
          updated_at: string
          version: number
        }
        Insert: {
          comp_ai_max_tokens?: number
          comp_ai_model?: string
          comp_ai_temperature?: number
          comp_approved_reasons?: Json
          comp_daily_pct_critical?: number
          comp_daily_pct_warning?: number
          comp_high_pct_threshold?: number
          comp_high_value_threshold?: number
          comp_manager_min_high_value?: number
          comp_manager_roles?: string[]
          comp_server_max_amount?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          is_active?: boolean
          labor_cplh_target?: number
          labor_cplh_tolerance?: number
          labor_excluded_roles?: string[]
          labor_ot_critical_threshold?: number
          labor_ot_warning_threshold?: number
          labor_pct_tolerance?: number
          labor_splh_floor?: number
          labor_target_pct?: number
          org_id: string
          revenue_avg_cover_ceiling?: number | null
          revenue_avg_cover_floor?: number | null
          revenue_bev_mix_target?: number | null
          revenue_bev_mix_tolerance?: number | null
          revenue_cover_drop_critical?: number | null
          revenue_cover_drop_warning?: number | null
          revenue_promo_tags?: string[] | null
          superseded_by_org_id?: string | null
          superseded_by_version?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          comp_ai_max_tokens?: number
          comp_ai_model?: string
          comp_ai_temperature?: number
          comp_approved_reasons?: Json
          comp_daily_pct_critical?: number
          comp_daily_pct_warning?: number
          comp_high_pct_threshold?: number
          comp_high_value_threshold?: number
          comp_manager_min_high_value?: number
          comp_manager_roles?: string[]
          comp_server_max_amount?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          is_active?: boolean
          labor_cplh_target?: number
          labor_cplh_tolerance?: number
          labor_excluded_roles?: string[]
          labor_ot_critical_threshold?: number
          labor_ot_warning_threshold?: number
          labor_pct_tolerance?: number
          labor_splh_floor?: number
          labor_target_pct?: number
          org_id?: string
          revenue_avg_cover_ceiling?: number | null
          revenue_avg_cover_floor?: number | null
          revenue_bev_mix_target?: number | null
          revenue_bev_mix_tolerance?: number | null
          revenue_cover_drop_critical?: number | null
          revenue_cover_drop_warning?: number | null
          revenue_promo_tags?: string[] | null
          superseded_by_org_id?: string | null
          superseded_by_version?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_standards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_standards_superseded_by_org_id_fkey"
            columns: ["superseded_by_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_standards_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changes: Json | null
          id: string
          org_id: string
          version: number
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json | null
          id?: string
          org_id: string
          version: number
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json | null
          id?: string
          org_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_standards_audit_org_id_version_fkey"
            columns: ["org_id", "version"]
            isOneToOne: false
            referencedRelation: "operational_standards"
            referencedColumns: ["org_id", "version"]
          },
        ]
      }
      organization_settings: {
        Row: {
          allow_mobile_clock_in: boolean | null
          allow_shift_swaps: boolean | null
          allow_time_off_requests: boolean | null
          created_at: string
          daily_briefing_enabled: boolean | null
          daily_briefing_time: string | null
          enable_auto_scheduling: boolean | null
          enable_labor_forecasting: boolean | null
          fiscal_calendar_type: string
          fiscal_year_start_date: string | null
          geofence_radius_meters: number | null
          id: string
          min_notice_hours_time_off: number | null
          notify_email: boolean | null
          notify_slack: boolean | null
          organization_id: string
          require_geofence: boolean | null
          require_manager_approval_swaps: boolean | null
          require_photo_verification: boolean | null
          slack_webhook_url: string | null
          target_labor_percentage: number | null
          updated_at: string
        }
        Insert: {
          allow_mobile_clock_in?: boolean | null
          allow_shift_swaps?: boolean | null
          allow_time_off_requests?: boolean | null
          created_at?: string
          daily_briefing_enabled?: boolean | null
          daily_briefing_time?: string | null
          enable_auto_scheduling?: boolean | null
          enable_labor_forecasting?: boolean | null
          fiscal_calendar_type?: string
          fiscal_year_start_date?: string | null
          geofence_radius_meters?: number | null
          id?: string
          min_notice_hours_time_off?: number | null
          notify_email?: boolean | null
          notify_slack?: boolean | null
          organization_id: string
          require_geofence?: boolean | null
          require_manager_approval_swaps?: boolean | null
          require_photo_verification?: boolean | null
          slack_webhook_url?: string | null
          target_labor_percentage?: number | null
          updated_at?: string
        }
        Update: {
          allow_mobile_clock_in?: boolean | null
          allow_shift_swaps?: boolean | null
          allow_time_off_requests?: boolean | null
          created_at?: string
          daily_briefing_enabled?: boolean | null
          daily_briefing_time?: string | null
          enable_auto_scheduling?: boolean | null
          enable_labor_forecasting?: boolean | null
          fiscal_calendar_type?: string
          fiscal_year_start_date?: string | null
          geofence_radius_meters?: number | null
          id?: string
          min_notice_hours_time_off?: number | null
          notify_email?: boolean | null
          notify_slack?: boolean | null
          organization_id?: string
          require_geofence?: boolean | null
          require_manager_approval_swaps?: boolean | null
          require_photo_verification?: boolean | null
          slack_webhook_url?: string | null
          target_labor_percentage?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_usage: {
        Row: {
          active_employees: number | null
          api_calls: number | null
          computed_cost: number | null
          created_at: string
          id: string
          organization_id: string
          period_end: string
          period_start: string
          storage_used_gb: number | null
          total_clock_ins: number | null
          total_shifts: number | null
        }
        Insert: {
          active_employees?: number | null
          api_calls?: number | null
          computed_cost?: number | null
          created_at?: string
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          storage_used_gb?: number | null
          total_clock_ins?: number | null
          total_shifts?: number | null
        }
        Update: {
          active_employees?: number | null
          api_calls?: number | null
          computed_cost?: number | null
          created_at?: string
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          storage_used_gb?: number | null
          total_clock_ins?: number | null
          total_shifts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean | null
          organization_id: string
          role: string
          updated_at: string
          user_id: string
          venue_ids: string[] | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          organization_id: string
          role: string
          updated_at?: string
          user_id: string
          venue_ids?: string[] | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          organization_id?: string
          role?: string
          updated_at?: string
          user_id?: string
          venue_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_address: Json | null
          billing_email: string | null
          created_at: string
          currency: string | null
          date_format: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          legal_name: string | null
          logo_url: string | null
          max_employees: number | null
          max_storage_gb: number | null
          max_venues: number | null
          name: string
          onboarding_completed: boolean | null
          plan: string
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          slug: string
          stripe_customer_id: string | null
          subscription_starts_at: string | null
          subscription_status: string
          tax_id: string | null
          time_format: string | null
          timezone: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          billing_email?: string | null
          created_at?: string
          currency?: string | null
          date_format?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          max_employees?: number | null
          max_storage_gb?: number | null
          max_venues?: number | null
          name: string
          onboarding_completed?: boolean | null
          plan?: string
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          slug: string
          stripe_customer_id?: string | null
          subscription_starts_at?: string | null
          subscription_status?: string
          tax_id?: string | null
          time_format?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          billing_email?: string | null
          created_at?: string
          currency?: string | null
          date_format?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          max_employees?: number | null
          max_storage_gb?: number | null
          max_venues?: number | null
          name?: string
          onboarding_completed?: boolean | null
          plan?: string
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          slug?: string
          stripe_customer_id?: string | null
          subscription_starts_at?: string | null
          subscription_status?: string
          tax_id?: string | null
          time_format?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pacing_baselines: {
        Row: {
          cancel_rate_t24: number | null
          day_type: string
          id: string
          last_computed_at: string | null
          sample_end_date: string | null
          sample_size: number
          sample_start_date: string | null
          typical_on_hand_t12: number | null
          typical_on_hand_t24: number
          typical_on_hand_t48: number | null
          venue_id: string
        }
        Insert: {
          cancel_rate_t24?: number | null
          day_type: string
          id?: string
          last_computed_at?: string | null
          sample_end_date?: string | null
          sample_size?: number
          sample_start_date?: string | null
          typical_on_hand_t12?: number | null
          typical_on_hand_t24?: number
          typical_on_hand_t48?: number | null
          venue_id: string
        }
        Update: {
          cancel_rate_t24?: number | null
          day_type?: string
          id?: string
          last_computed_at?: string | null
          sample_end_date?: string | null
          sample_size?: number
          sample_start_date?: string | null
          typical_on_hand_t12?: number | null
          typical_on_hand_t24?: number
          typical_on_hand_t48?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacing_baselines_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "pacing_baselines_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          email: string
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          user_id: string
        }
        Insert: {
          email: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          user_id: string
        }
        Update: {
          email?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pos_checks: {
        Row: {
          business_date: string
          close_time: string | null
          created_at: string
          external_check_id: string
          guest_count: number
          id: string
          open_time: string
          pos_type: string
          raw_data: Json | null
          server_external_id: string | null
          server_name: string | null
          subtotal: number | null
          table_name: string | null
          tax_amount: number | null
          tip_amount: number | null
          total_amount: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          business_date: string
          close_time?: string | null
          created_at?: string
          external_check_id: string
          guest_count?: number
          id?: string
          open_time: string
          pos_type: string
          raw_data?: Json | null
          server_external_id?: string | null
          server_name?: string | null
          subtotal?: number | null
          table_name?: string | null
          tax_amount?: number | null
          tip_amount?: number | null
          total_amount?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          business_date?: string
          close_time?: string | null
          created_at?: string
          external_check_id?: string
          guest_count?: number
          id?: string
          open_time?: string
          pos_type?: string
          raw_data?: Json | null
          server_external_id?: string | null
          server_name?: string | null
          subtotal?: number | null
          table_name?: string | null
          tax_amount?: number | null
          tip_amount?: number | null
          total_amount?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_checks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "pos_checks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_items: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_mapped: boolean | null
          item_category: string | null
          pos_category: string | null
          pos_name: string
          pos_sku: string
          recipe_id: string | null
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_mapped?: boolean | null
          item_category?: string | null
          pos_category?: string | null
          pos_name: string
          pos_sku: string
          recipe_id?: string | null
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_mapped?: boolean | null
          item_category?: string | null
          pos_category?: string | null
          pos_name?: string
          pos_sku?: string
          recipe_id?: string | null
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_cost_rollup"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "pos_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "pos_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_menu_map: {
        Row: {
          created_at: string | null
          external_item_id: string
          id: string
          is_active: boolean | null
          menu_item_id: string
          pos_type: Database["public"]["Enums"]["pos_type"]
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          external_item_id: string
          id?: string
          is_active?: boolean | null
          menu_item_id: string
          pos_type: Database["public"]["Enums"]["pos_type"]
          venue_id: string
        }
        Update: {
          created_at?: string | null
          external_item_id?: string
          id?: string
          is_active?: boolean | null
          menu_item_id?: string
          pos_type?: Database["public"]["Enums"]["pos_type"]
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_menu_map_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_menu_map_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "pos_menu_map_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          cogs: number | null
          gross_sales: number
          id: string
          imported_at: string | null
          imported_by: string | null
          item_name: string
          net_sales: number
          pos_sku: string
          quantity: number
          recipe_id: string | null
          sale_date: string
          venue_id: string
        }
        Insert: {
          cogs?: number | null
          gross_sales: number
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          item_name: string
          net_sales: number
          pos_sku: string
          quantity: number
          recipe_id?: string | null
          sale_date: string
          venue_id: string
        }
        Update: {
          cogs?: number | null
          gross_sales?: number
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          item_name?: string
          net_sales?: number
          pos_sku?: string
          quantity?: number
          recipe_id?: string | null
          sale_date?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_cost_rollup"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "pos_sales_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "pos_sales_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          base_hourly_rate: number
          category: string
          created_at: string
          id: string
          is_active: boolean | null
          is_schedulable: boolean | null
          name: string
          requires_certification: boolean | null
          tipped: boolean | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          base_hourly_rate: number
          category: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_schedulable?: boolean | null
          name: string
          requires_certification?: boolean | null
          tipped?: boolean | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          base_hourly_rate?: number
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_schedulable?: boolean | null
          name?: string
          requires_certification?: boolean | null
          tipped?: boolean | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "positions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      product_weights: {
        Row: {
          abv_percent: number
          brand: string | null
          created_at: string
          empty_g: number | null
          empty_g_source: string | null
          empty_g_source_ref: string | null
          full_g: number | null
          full_g_source: string | null
          full_g_source_ref: string | null
          product_name: string | null
          size_ml: number
          sku_id: string
          upc_ean: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          abv_percent?: number
          brand?: string | null
          created_at?: string
          empty_g?: number | null
          empty_g_source?: string | null
          empty_g_source_ref?: string | null
          full_g?: number | null
          full_g_source?: string | null
          full_g_source_ref?: string | null
          product_name?: string | null
          size_ml: number
          sku_id: string
          upc_ean?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          abv_percent?: number
          brand?: string | null
          created_at?: string
          empty_g?: number | null
          empty_g_source?: string | null
          empty_g_source_ref?: string | null
          full_g?: number | null
          full_g_source?: string | null
          full_g_source_ref?: string | null
          product_name?: string | null
          size_ml?: number
          sku_id?: string
          upc_ean?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_weights_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_custom_fields: {
        Row: {
          created_at: string | null
          field_label: string
          field_name: string
          field_options: Json | null
          field_type: string
          id: string
          is_required: boolean | null
          is_visible_by_default: boolean | null
          position: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          field_label: string
          field_name: string
          field_options?: Json | null
          field_type?: string
          id?: string
          is_required?: boolean | null
          is_visible_by_default?: boolean | null
          position?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          field_label?: string
          field_name?: string
          field_options?: Json | null
          field_type?: string
          id?: string
          is_required?: boolean | null
          is_visible_by_default?: boolean | null
          position?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      production_custom_stages: {
        Row: {
          color: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          position: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          id: string
          is_active?: boolean | null
          name: string
          position?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          position?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      production_order_attachments: {
        Row: {
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          production_order_id: string
          uploaded_at: string | null
          uploaded_by: string
        }
        Insert: {
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          production_order_id: string
          uploaded_at?: string | null
          uploaded_by: string
        }
        Update: {
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          production_order_id?: string
          uploaded_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_attachments_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_notes: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          is_internal: boolean | null
          note: string
          production_order_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          is_internal?: boolean | null
          note: string
          production_order_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          is_internal?: boolean | null
          note?: string
          production_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_notes_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_stage_history: {
        Row: {
          changed_at: string | null
          changed_by: string
          from_stage: string | null
          id: string
          notes: string | null
          production_order_id: string
          to_stage: string
        }
        Insert: {
          changed_at?: string | null
          changed_by: string
          from_stage?: string | null
          id?: string
          notes?: string | null
          production_order_id: string
          to_stage: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string
          from_stage?: string | null
          id?: string
          notes?: string | null
          production_order_id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_stage_history_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          art_approval: string | null
          artwork_details: string | null
          assigned_to: string | null
          color: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          customer_company: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_payment_terms: string | null
          description: string | null
          due_date: string | null
          esd: string | null
          hubspot_deal: string | null
          hubspot_deal_id: string | null
          id: string
          in_hands_date: string | null
          invoice_amount: number | null
          invoice_number: string | null
          is_on_hold: boolean | null
          is_rush: boolean | null
          labels: Json | null
          last_synced_at: string | null
          lead_time: string | null
          members: Json | null
          needs_artwork: boolean | null
          needs_manager: boolean | null
          needs_payment: boolean | null
          needs_sales: boolean | null
          needs_stocking: boolean | null
          needs_warehouse: boolean | null
          order_date: string | null
          order_number: string
          order_type: string | null
          pantone: string | null
          payment_status: string | null
          po_number: string | null
          position: number | null
          print_colors: number | null
          product: string | null
          product_name: string
          proof_approved_date: string | null
          proof_expires_date: string | null
          proof_file_url: string | null
          proof_sent_date: string | null
          proof_status: string | null
          quantity: number | null
          quote_amount: number | null
          quote_id: string | null
          run_type: string | null
          sales_rep: string | null
          sales_rep_email: string | null
          shipping_address: string | null
          sides_printed: number | null
          size_dimensions: string | null
          sku: string | null
          stage: string
          supplier: string | null
          sync_errors: string | null
          tracking_number: string | null
          trello_card_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          art_approval?: string | null
          artwork_details?: string | null
          assigned_to?: string | null
          color?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_payment_terms?: string | null
          description?: string | null
          due_date?: string | null
          esd?: string | null
          hubspot_deal?: string | null
          hubspot_deal_id?: string | null
          id?: string
          in_hands_date?: string | null
          invoice_amount?: number | null
          invoice_number?: string | null
          is_on_hold?: boolean | null
          is_rush?: boolean | null
          labels?: Json | null
          last_synced_at?: string | null
          lead_time?: string | null
          members?: Json | null
          needs_artwork?: boolean | null
          needs_manager?: boolean | null
          needs_payment?: boolean | null
          needs_sales?: boolean | null
          needs_stocking?: boolean | null
          needs_warehouse?: boolean | null
          order_date?: string | null
          order_number: string
          order_type?: string | null
          pantone?: string | null
          payment_status?: string | null
          po_number?: string | null
          position?: number | null
          print_colors?: number | null
          product?: string | null
          product_name: string
          proof_approved_date?: string | null
          proof_expires_date?: string | null
          proof_file_url?: string | null
          proof_sent_date?: string | null
          proof_status?: string | null
          quantity?: number | null
          quote_amount?: number | null
          quote_id?: string | null
          run_type?: string | null
          sales_rep?: string | null
          sales_rep_email?: string | null
          shipping_address?: string | null
          sides_printed?: number | null
          size_dimensions?: string | null
          sku?: string | null
          stage?: string
          supplier?: string | null
          sync_errors?: string | null
          tracking_number?: string | null
          trello_card_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          art_approval?: string | null
          artwork_details?: string | null
          assigned_to?: string | null
          color?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_payment_terms?: string | null
          description?: string | null
          due_date?: string | null
          esd?: string | null
          hubspot_deal?: string | null
          hubspot_deal_id?: string | null
          id?: string
          in_hands_date?: string | null
          invoice_amount?: number | null
          invoice_number?: string | null
          is_on_hold?: boolean | null
          is_rush?: boolean | null
          labels?: Json | null
          last_synced_at?: string | null
          lead_time?: string | null
          members?: Json | null
          needs_artwork?: boolean | null
          needs_manager?: boolean | null
          needs_payment?: boolean | null
          needs_sales?: boolean | null
          needs_stocking?: boolean | null
          needs_warehouse?: boolean | null
          order_date?: string | null
          order_number?: string
          order_type?: string | null
          pantone?: string | null
          payment_status?: string | null
          po_number?: string | null
          position?: number | null
          print_colors?: number | null
          product?: string | null
          product_name?: string
          proof_approved_date?: string | null
          proof_expires_date?: string | null
          proof_file_url?: string | null
          proof_sent_date?: string | null
          proof_status?: string | null
          quantity?: number | null
          quote_amount?: number | null
          quote_id?: string | null
          run_type?: string | null
          sales_rep?: string | null
          sales_rep_email?: string | null
          shipping_address?: string | null
          sides_printed?: number | null
          size_dimensions?: string | null
          sku?: string | null
          stage?: string
          supplier?: string | null
          sync_errors?: string | null
          tracking_number?: string | null
          trello_card_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      production_user_preferences: {
        Row: {
          created_at: string | null
          id: string
          preference_key: string
          preference_value: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          preference_key: string
          preference_value: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          preference_key?: string
          preference_value?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      proforma_calc_runs: {
        Row: {
          created_at: string
          engine_version: string
          error: string | null
          id: string
          inputs_hash: string
          scenario_id: string
          status: string
        }
        Insert: {
          created_at?: string
          engine_version: string
          error?: string | null
          id?: string
          inputs_hash: string
          scenario_id: string
          status: string
        }
        Update: {
          created_at?: string
          engine_version?: string
          error?: string | null
          id?: string
          inputs_hash?: string
          scenario_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_calc_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_calc_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_calc_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_calc_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_capex_assumptions: {
        Row: {
          created_at: string
          debt_interest_rate: number | null
          debt_term_months: number | null
          equity_pct: number | null
          extra: Json | null
          interest_only_months: number | null
          lender_fee_capitalize: boolean | null
          lender_fee_pct: number | null
          scenario_id: string
          total_capex: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          debt_interest_rate?: number | null
          debt_term_months?: number | null
          equity_pct?: number | null
          extra?: Json | null
          interest_only_months?: number | null
          lender_fee_capitalize?: boolean | null
          lender_fee_pct?: number | null
          scenario_id: string
          total_capex?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          debt_interest_rate?: number | null
          debt_term_months?: number | null
          equity_pct?: number | null
          extra?: Json | null
          interest_only_months?: number | null
          lender_fee_capitalize?: boolean | null
          lender_fee_pct?: number | null
          scenario_id?: string
          total_capex?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_capex_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_capex_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_capex_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_capex_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_categories: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          is_summary: boolean
          name: string
          org_id: string
          section: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order: number
          id?: string
          is_summary?: boolean
          name: string
          org_id: string
          section: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          is_summary?: boolean
          name?: string
          org_id?: string
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_center_service_participation: {
        Row: {
          active_hours: number | null
          avg_dwell_hours: number | null
          avg_dwell_hours_seated: number | null
          avg_guests_per_event: number | null
          avg_spend_per_guest: number | null
          bar_bev_pct: number | null
          bar_food_pct: number | null
          bar_guests: number | null
          bar_mode_override: Database["public"]["Enums"]["bar_mode"] | null
          bar_rail_ft_per_guest: number | null
          bar_revenue: number | null
          bar_utilization_pct: number | null
          calculated_standing_capacity: number | null
          covers: number | null
          created_at: string
          default_utilization_pct: number | null
          events_per_service: number | null
          guests_per_hour: number | null
          id: string
          is_active: boolean
          min_spend_per_event: number | null
          net_standing_area_sqft: number | null
          notes: string | null
          pdr_covers: number | null
          pdr_revenue: number | null
          pricing_model: string | null
          realization_rate: number | null
          revenue_center_id: string
          service_period_id: string
          sqft_per_person: number | null
          standing_capacity: number | null
          standing_factor: number | null
          updated_at: string
          utilization_pct: number | null
        }
        Insert: {
          active_hours?: number | null
          avg_dwell_hours?: number | null
          avg_dwell_hours_seated?: number | null
          avg_guests_per_event?: number | null
          avg_spend_per_guest?: number | null
          bar_bev_pct?: number | null
          bar_food_pct?: number | null
          bar_guests?: number | null
          bar_mode_override?: Database["public"]["Enums"]["bar_mode"] | null
          bar_rail_ft_per_guest?: number | null
          bar_revenue?: number | null
          bar_utilization_pct?: number | null
          calculated_standing_capacity?: number | null
          covers?: number | null
          created_at?: string
          default_utilization_pct?: number | null
          events_per_service?: number | null
          guests_per_hour?: number | null
          id?: string
          is_active?: boolean
          min_spend_per_event?: number | null
          net_standing_area_sqft?: number | null
          notes?: string | null
          pdr_covers?: number | null
          pdr_revenue?: number | null
          pricing_model?: string | null
          realization_rate?: number | null
          revenue_center_id: string
          service_period_id: string
          sqft_per_person?: number | null
          standing_capacity?: number | null
          standing_factor?: number | null
          updated_at?: string
          utilization_pct?: number | null
        }
        Update: {
          active_hours?: number | null
          avg_dwell_hours?: number | null
          avg_dwell_hours_seated?: number | null
          avg_guests_per_event?: number | null
          avg_spend_per_guest?: number | null
          bar_bev_pct?: number | null
          bar_food_pct?: number | null
          bar_guests?: number | null
          bar_mode_override?: Database["public"]["Enums"]["bar_mode"] | null
          bar_rail_ft_per_guest?: number | null
          bar_revenue?: number | null
          bar_utilization_pct?: number | null
          calculated_standing_capacity?: number | null
          covers?: number | null
          created_at?: string
          default_utilization_pct?: number | null
          events_per_service?: number | null
          guests_per_hour?: number | null
          id?: string
          is_active?: boolean
          min_spend_per_event?: number | null
          net_standing_area_sqft?: number | null
          notes?: string | null
          pdr_covers?: number | null
          pdr_revenue?: number | null
          pricing_model?: string | null
          realization_rate?: number | null
          revenue_center_id?: string
          service_period_id?: string
          sqft_per_person?: number | null
          standing_capacity?: number | null
          standing_factor?: number | null
          updated_at?: string
          utilization_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proforma_center_service_participation_revenue_center_id_fkey"
            columns: ["revenue_center_id"]
            isOneToOne: false
            referencedRelation: "proforma_revenue_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_center_service_participation_service_period_id_fkey"
            columns: ["service_period_id"]
            isOneToOne: false
            referencedRelation: "proforma_revenue_service_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_city_wage_presets: {
        Row: {
          city_name: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean | null
          market_tier: string
          min_wage: number
          state_code: string
          tenant_id: string | null
          tip_credit: number
          updated_at: string
          version: number
        }
        Insert: {
          city_name: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          market_tier?: string
          min_wage: number
          state_code: string
          tenant_id?: string | null
          tip_credit?: number
          updated_at?: string
          version?: number
        }
        Update: {
          city_name?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          market_tier?: string
          min_wage?: number
          state_code?: string
          tenant_id?: string | null
          tip_credit?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      proforma_cogs_assumptions: {
        Row: {
          bev_cogs_pct: number | null
          created_at: string
          extra: Json | null
          food_cogs_pct: number | null
          other_cogs_pct: number | null
          scenario_id: string
          updated_at: string
        }
        Insert: {
          bev_cogs_pct?: number | null
          created_at?: string
          extra?: Json | null
          food_cogs_pct?: number | null
          other_cogs_pct?: number | null
          scenario_id: string
          updated_at?: string
        }
        Update: {
          bev_cogs_pct?: number | null
          created_at?: string
          extra?: Json | null
          food_cogs_pct?: number | null
          other_cogs_pct?: number | null
          scenario_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_cogs_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_cogs_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_cogs_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_cogs_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_concept_benchmarks: {
        Row: {
          concept_type: string
          created_at: string
          created_by: string | null
          dining_area_pct_max: number
          dining_area_pct_min: number
          effective_date: string
          guest_facing_pct_max: number | null
          guest_facing_pct_min: number | null
          id: string
          is_active: boolean | null
          kitchen_boh_pct_max: number | null
          kitchen_boh_pct_min: number | null
          market_tier: string | null
          seats_per_1k_sf_max: number
          seats_per_1k_sf_min: number
          sf_per_seat_max: number
          sf_per_seat_min: number
          storage_office_pct_max: number | null
          storage_office_pct_min: number | null
          tenant_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          concept_type: string
          created_at?: string
          created_by?: string | null
          dining_area_pct_max: number
          dining_area_pct_min: number
          effective_date?: string
          guest_facing_pct_max?: number | null
          guest_facing_pct_min?: number | null
          id?: string
          is_active?: boolean | null
          kitchen_boh_pct_max?: number | null
          kitchen_boh_pct_min?: number | null
          market_tier?: string | null
          seats_per_1k_sf_max: number
          seats_per_1k_sf_min: number
          sf_per_seat_max: number
          sf_per_seat_min: number
          storage_office_pct_max?: number | null
          storage_office_pct_min?: number | null
          tenant_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          concept_type?: string
          created_at?: string
          created_by?: string | null
          dining_area_pct_max?: number
          dining_area_pct_min?: number
          effective_date?: string
          guest_facing_pct_max?: number | null
          guest_facing_pct_min?: number | null
          id?: string
          is_active?: boolean | null
          kitchen_boh_pct_max?: number | null
          kitchen_boh_pct_min?: number | null
          market_tier?: string | null
          seats_per_1k_sf_max?: number
          seats_per_1k_sf_min?: number
          sf_per_seat_max?: number
          sf_per_seat_min?: number
          storage_office_pct_max?: number | null
          storage_office_pct_min?: number | null
          tenant_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      proforma_labor_assumptions: {
        Row: {
          agm_salary_annual: number | null
          boh_hourly_rate: number | null
          boh_hours_per_100_covers: number | null
          created_at: string
          extra: Json | null
          foh_hourly_rate: number | null
          foh_hours_per_100_covers: number | null
          gm_salary_annual: number | null
          km_salary_annual: number | null
          payroll_burden_pct: number | null
          scenario_id: string
          updated_at: string
        }
        Insert: {
          agm_salary_annual?: number | null
          boh_hourly_rate?: number | null
          boh_hours_per_100_covers?: number | null
          created_at?: string
          extra?: Json | null
          foh_hourly_rate?: number | null
          foh_hours_per_100_covers?: number | null
          gm_salary_annual?: number | null
          km_salary_annual?: number | null
          payroll_burden_pct?: number | null
          scenario_id: string
          updated_at?: string
        }
        Update: {
          agm_salary_annual?: number | null
          boh_hourly_rate?: number | null
          boh_hours_per_100_covers?: number | null
          created_at?: string
          extra?: Json | null
          foh_hourly_rate?: number | null
          foh_hours_per_100_covers?: number | null
          gm_salary_annual?: number | null
          km_salary_annual?: number | null
          payroll_burden_pct?: number | null
          scenario_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_labor_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_labor_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_labor_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_labor_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_labor_position_templates: {
        Row: {
          applies_to: string[] | null
          category: string
          concept_type: string
          cover_threshold: number | null
          created_at: string
          hourly_rate: number
          hours_per_100_covers: number | null
          hours_per_shift: number | null
          id: string
          is_active: boolean | null
          is_tipped: boolean | null
          labor_driver_type: string | null
          position_name: string
          staff_per_service: number | null
          updated_at: string
          wage_multiplier: number | null
        }
        Insert: {
          applies_to?: string[] | null
          category: string
          concept_type: string
          cover_threshold?: number | null
          created_at?: string
          hourly_rate: number
          hours_per_100_covers?: number | null
          hours_per_shift?: number | null
          id?: string
          is_active?: boolean | null
          is_tipped?: boolean | null
          labor_driver_type?: string | null
          position_name: string
          staff_per_service?: number | null
          updated_at?: string
          wage_multiplier?: number | null
        }
        Update: {
          applies_to?: string[] | null
          category?: string
          concept_type?: string
          cover_threshold?: number | null
          created_at?: string
          hourly_rate?: number
          hours_per_100_covers?: number | null
          hours_per_shift?: number | null
          id?: string
          is_active?: boolean | null
          is_tipped?: boolean | null
          labor_driver_type?: string | null
          position_name?: string
          staff_per_service?: number | null
          updated_at?: string
          wage_multiplier?: number | null
        }
        Relationships: []
      }
      proforma_labor_positions: {
        Row: {
          applies_to: string[] | null
          category: string
          cover_threshold: number | null
          created_at: string
          hourly_rate: number
          hours_per_100_covers: number | null
          hours_per_shift: number | null
          id: string
          is_active: boolean | null
          labor_driver_type: string
          position_mix_pct: number | null
          position_name: string
          scenario_id: string
          sort_order: number | null
          staff_per_service: number | null
          updated_at: string
        }
        Insert: {
          applies_to?: string[] | null
          category: string
          cover_threshold?: number | null
          created_at?: string
          hourly_rate: number
          hours_per_100_covers?: number | null
          hours_per_shift?: number | null
          id?: string
          is_active?: boolean | null
          labor_driver_type?: string
          position_mix_pct?: number | null
          position_name: string
          scenario_id: string
          sort_order?: number | null
          staff_per_service?: number | null
          updated_at?: string
        }
        Update: {
          applies_to?: string[] | null
          category?: string
          cover_threshold?: number | null
          created_at?: string
          hourly_rate?: number
          hours_per_100_covers?: number | null
          hours_per_shift?: number | null
          id?: string
          is_active?: boolean | null
          labor_driver_type?: string
          position_mix_pct?: number | null
          position_name?: string
          scenario_id?: string
          sort_order?: number | null
          staff_per_service?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_labor_positions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_labor_positions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_labor_positions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_labor_positions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_labor_salaried_roles: {
        Row: {
          annual_salary: number
          created_at: string
          end_month: number | null
          id: string
          role_name: string
          scenario_id: string
          start_month: number
          updated_at: string
        }
        Insert: {
          annual_salary: number
          created_at?: string
          end_month?: number | null
          id?: string
          role_name: string
          scenario_id: string
          start_month?: number
          updated_at?: string
        }
        Update: {
          annual_salary?: number
          created_at?: string
          end_month?: number | null
          id?: string
          role_name?: string
          scenario_id?: string
          start_month?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_labor_salaried_roles_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_labor_salaried_roles_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_labor_salaried_roles_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_labor_salaried_roles_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_membership_assumptions: {
        Row: {
          churn_monthly: number
          churn_start_month_index: number
          created_at: string
          extra: Json | null
          growth_curve: Json | null
          initiation_fee: number
          member_cap: number
          members_at_open: number
          monthly_dues: number
          ramp_curve: Json | null
          scenario_id: string
          updated_at: string
        }
        Insert: {
          churn_monthly?: number
          churn_start_month_index?: number
          created_at?: string
          extra?: Json | null
          growth_curve?: Json | null
          initiation_fee?: number
          member_cap?: number
          members_at_open?: number
          monthly_dues?: number
          ramp_curve?: Json | null
          scenario_id: string
          updated_at?: string
        }
        Update: {
          churn_monthly?: number
          churn_start_month_index?: number
          created_at?: string
          extra?: Json | null
          growth_curve?: Json | null
          initiation_fee?: number
          member_cap?: number
          members_at_open?: number
          monthly_dues?: number
          ramp_curve?: Json | null
          scenario_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_membership_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_membership_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_membership_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_membership_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_monthly_categories: {
        Row: {
          amount: number
          calc_run_id: string | null
          category_id: string
          created_at: string
          id: number
          month_index: number
          period_start_date: string
          scenario_id: string
        }
        Insert: {
          amount: number
          calc_run_id?: string | null
          category_id: string
          created_at?: string
          id?: number
          month_index: number
          period_start_date: string
          scenario_id: string
        }
        Update: {
          amount?: number
          calc_run_id?: string | null
          category_id?: string
          created_at?: string
          id?: number
          month_index?: number
          period_start_date?: string
          scenario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_monthly_categories_calc_run_id_fkey"
            columns: ["calc_run_id"]
            isOneToOne: false
            referencedRelation: "proforma_calc_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_monthly_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "proforma_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_monthly_categories_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_monthly_categories_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_monthly_categories_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_monthly_categories_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_monthly_gl: {
        Row: {
          amount: number
          calc_run_id: string | null
          created_at: string
          gl_account_id: string
          id: number
          month_index: number
          period_start_date: string
          scenario_id: string
        }
        Insert: {
          amount: number
          calc_run_id?: string | null
          created_at?: string
          gl_account_id: string
          id?: number
          month_index: number
          period_start_date: string
          scenario_id: string
        }
        Update: {
          amount?: number
          calc_run_id?: string | null
          created_at?: string
          gl_account_id?: string
          id?: number
          month_index?: number
          period_start_date?: string
          scenario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_monthly_gl_calc_run_id_fkey"
            columns: ["calc_run_id"]
            isOneToOne: false
            referencedRelation: "proforma_calc_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_monthly_gl_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_monthly_gl_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_monthly_gl_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_monthly_gl_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_monthly_gl_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_monthly_summary: {
        Row: {
          bev_revenue: number
          calc_run_id: string | null
          cash_flow: number
          created_at: string
          cumulative_cash: number
          debt_service: number
          ebitda: number
          food_revenue: number
          gross_profit: number
          id: number
          month_index: number
          net_income: number
          other_revenue: number
          period_start_date: string
          scenario_id: string
          total_cogs: number
          total_covers: number
          total_labor: number
          total_opex: number
          total_revenue: number
        }
        Insert: {
          bev_revenue: number
          calc_run_id?: string | null
          cash_flow: number
          created_at?: string
          cumulative_cash: number
          debt_service: number
          ebitda: number
          food_revenue: number
          gross_profit: number
          id?: number
          month_index: number
          net_income: number
          other_revenue: number
          period_start_date: string
          scenario_id: string
          total_cogs: number
          total_covers: number
          total_labor: number
          total_opex: number
          total_revenue: number
        }
        Update: {
          bev_revenue?: number
          calc_run_id?: string | null
          cash_flow?: number
          created_at?: string
          cumulative_cash?: number
          debt_service?: number
          ebitda?: number
          food_revenue?: number
          gross_profit?: number
          id?: number
          month_index?: number
          net_income?: number
          other_revenue?: number
          period_start_date?: string
          scenario_id?: string
          total_cogs?: number
          total_covers?: number
          total_labor?: number
          total_opex?: number
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "proforma_monthly_summary_calc_run_id_fkey"
            columns: ["calc_run_id"]
            isOneToOne: false
            referencedRelation: "proforma_calc_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_monthly_summary_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_monthly_summary_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_monthly_summary_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_monthly_summary_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_occupancy_opex_assumptions: {
        Row: {
          base_rent_monthly: number | null
          cam_monthly: number | null
          cc_fees_pct_of_sales: number | null
          cleaning_supplies_pct: number | null
          corporate_overhead_flat_monthly: number | null
          created_at: string
          extra: Json | null
          gna_pct_of_sales: number | null
          insurance_monthly: number | null
          linen_pct_of_sales: number | null
          marketing_boost_months: number | null
          marketing_boost_multiplier: number | null
          marketing_pct_of_sales: number | null
          other_opex_flat_monthly: number | null
          property_tax_monthly: number | null
          scenario_id: string
          smallwares_pct_of_sales: number | null
          updated_at: string
          utilities_monthly: number | null
        }
        Insert: {
          base_rent_monthly?: number | null
          cam_monthly?: number | null
          cc_fees_pct_of_sales?: number | null
          cleaning_supplies_pct?: number | null
          corporate_overhead_flat_monthly?: number | null
          created_at?: string
          extra?: Json | null
          gna_pct_of_sales?: number | null
          insurance_monthly?: number | null
          linen_pct_of_sales?: number | null
          marketing_boost_months?: number | null
          marketing_boost_multiplier?: number | null
          marketing_pct_of_sales?: number | null
          other_opex_flat_monthly?: number | null
          property_tax_monthly?: number | null
          scenario_id: string
          smallwares_pct_of_sales?: number | null
          updated_at?: string
          utilities_monthly?: number | null
        }
        Update: {
          base_rent_monthly?: number | null
          cam_monthly?: number | null
          cc_fees_pct_of_sales?: number | null
          cleaning_supplies_pct?: number | null
          corporate_overhead_flat_monthly?: number | null
          created_at?: string
          extra?: Json | null
          gna_pct_of_sales?: number | null
          insurance_monthly?: number | null
          linen_pct_of_sales?: number | null
          marketing_boost_months?: number | null
          marketing_boost_multiplier?: number | null
          marketing_pct_of_sales?: number | null
          other_opex_flat_monthly?: number | null
          property_tax_monthly?: number | null
          scenario_id?: string
          smallwares_pct_of_sales?: number | null
          updated_at?: string
          utilities_monthly?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proforma_occupancy_opex_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_occupancy_opex_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_occupancy_opex_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_occupancy_opex_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_preopening_assumptions: {
        Row: {
          construction_distribution: string | null
          created_at: string
          custom_distributions: Json | null
          duration_months: number
          ffne_distribution: string | null
          inventory_distribution: string | null
          marketing_distribution: string | null
          payroll_fixed_distribution: string | null
          payroll_variable_distribution: string | null
          scenario_id: string
          total_construction: number | null
          total_contingency: number | null
          total_ffne: number | null
          total_initial_inventory_fnb: number | null
          total_initial_inventory_other: number | null
          total_preopening_kitchen_bar: number | null
          total_preopening_management_fees: number | null
          total_preopening_marketing: number | null
          total_preopening_opening_order: number | null
          total_preopening_opex_gna: number | null
          total_preopening_opex_occupancy: number | null
          total_preopening_opex_operating: number | null
          total_preopening_payroll_fixed: number | null
          total_preopening_payroll_taxes: number | null
          total_preopening_payroll_variable: number | null
          total_preopening_training: number | null
          total_working_capital: number | null
          updated_at: string
        }
        Insert: {
          construction_distribution?: string | null
          created_at?: string
          custom_distributions?: Json | null
          duration_months?: number
          ffne_distribution?: string | null
          inventory_distribution?: string | null
          marketing_distribution?: string | null
          payroll_fixed_distribution?: string | null
          payroll_variable_distribution?: string | null
          scenario_id: string
          total_construction?: number | null
          total_contingency?: number | null
          total_ffne?: number | null
          total_initial_inventory_fnb?: number | null
          total_initial_inventory_other?: number | null
          total_preopening_kitchen_bar?: number | null
          total_preopening_management_fees?: number | null
          total_preopening_marketing?: number | null
          total_preopening_opening_order?: number | null
          total_preopening_opex_gna?: number | null
          total_preopening_opex_occupancy?: number | null
          total_preopening_opex_operating?: number | null
          total_preopening_payroll_fixed?: number | null
          total_preopening_payroll_taxes?: number | null
          total_preopening_payroll_variable?: number | null
          total_preopening_training?: number | null
          total_working_capital?: number | null
          updated_at?: string
        }
        Update: {
          construction_distribution?: string | null
          created_at?: string
          custom_distributions?: Json | null
          duration_months?: number
          ffne_distribution?: string | null
          inventory_distribution?: string | null
          marketing_distribution?: string | null
          payroll_fixed_distribution?: string | null
          payroll_variable_distribution?: string | null
          scenario_id?: string
          total_construction?: number | null
          total_contingency?: number | null
          total_ffne?: number | null
          total_initial_inventory_fnb?: number | null
          total_initial_inventory_other?: number | null
          total_preopening_kitchen_bar?: number | null
          total_preopening_management_fees?: number | null
          total_preopening_marketing?: number | null
          total_preopening_opening_order?: number | null
          total_preopening_opex_gna?: number | null
          total_preopening_opex_occupancy?: number | null
          total_preopening_opex_operating?: number | null
          total_preopening_payroll_fixed?: number | null
          total_preopening_payroll_taxes?: number | null
          total_preopening_payroll_variable?: number | null
          total_preopening_training?: number | null
          total_working_capital?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_preopening_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_preopening_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_preopening_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_preopening_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_preopening_categories: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          is_summary: boolean
          name: string
          org_id: string
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order: number
          id?: string
          is_summary?: boolean
          name: string
          org_id: string
          type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          is_summary?: boolean
          name?: string
          org_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_preopening_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_preopening_monthly: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          id: number
          month_index: number
          period_start_date: string
          scenario_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          id?: number
          month_index: number
          period_start_date: string
          scenario_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          id?: number
          month_index?: number
          period_start_date?: string
          scenario_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_preopening_monthly_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "proforma_preopening_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_preopening_monthly_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_preopening_monthly_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_preopening_monthly_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_preopening_monthly_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_projects: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          bar_net_to_gross: number | null
          bar_seats: number | null
          bar_zone_gross_sf: number | null
          bar_zone_net_sf: number | null
          bar_zone_pct: number | null
          boh_pct: number | null
          code_capacity_cap: number | null
          code_sf_per_person: number | null
          concept_archetype: string | null
          concept_type: string
          created_at: string
          density_benchmark: string | null
          dining_area_pct: number | null
          effective_standing_guests: number | null
          id: string
          is_archived: boolean | null
          location_city: string | null
          location_state: string | null
          manual_seats: number | null
          monthly_rent: number | null
          name: string
          org_id: string
          raw_standing_guests: number | null
          seats: number | null
          sf_per_seat: number | null
          sf_per_standing_guest: number | null
          square_feet_boh: number | null
          square_feet_foh: number | null
          standable_pct: number | null
          standable_sf: number | null
          standing_capacity_final: number | null
          standing_capacity_operational: number | null
          total_sf: number | null
          updated_at: string
          use_manual_seats: boolean | null
          use_manual_splits: boolean | null
          utilization_factor: number | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          bar_net_to_gross?: number | null
          bar_seats?: number | null
          bar_zone_gross_sf?: number | null
          bar_zone_net_sf?: number | null
          bar_zone_pct?: number | null
          boh_pct?: number | null
          code_capacity_cap?: number | null
          code_sf_per_person?: number | null
          concept_archetype?: string | null
          concept_type: string
          created_at?: string
          density_benchmark?: string | null
          dining_area_pct?: number | null
          effective_standing_guests?: number | null
          id?: string
          is_archived?: boolean | null
          location_city?: string | null
          location_state?: string | null
          manual_seats?: number | null
          monthly_rent?: number | null
          name: string
          org_id: string
          raw_standing_guests?: number | null
          seats?: number | null
          sf_per_seat?: number | null
          sf_per_standing_guest?: number | null
          square_feet_boh?: number | null
          square_feet_foh?: number | null
          standable_pct?: number | null
          standable_sf?: number | null
          standing_capacity_final?: number | null
          standing_capacity_operational?: number | null
          total_sf?: number | null
          updated_at?: string
          use_manual_seats?: boolean | null
          use_manual_splits?: boolean | null
          utilization_factor?: number | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          bar_net_to_gross?: number | null
          bar_seats?: number | null
          bar_zone_gross_sf?: number | null
          bar_zone_net_sf?: number | null
          bar_zone_pct?: number | null
          boh_pct?: number | null
          code_capacity_cap?: number | null
          code_sf_per_person?: number | null
          concept_archetype?: string | null
          concept_type?: string
          created_at?: string
          density_benchmark?: string | null
          dining_area_pct?: number | null
          effective_standing_guests?: number | null
          id?: string
          is_archived?: boolean | null
          location_city?: string | null
          location_state?: string | null
          manual_seats?: number | null
          monthly_rent?: number | null
          name?: string
          org_id?: string
          raw_standing_guests?: number | null
          seats?: number | null
          sf_per_seat?: number | null
          sf_per_standing_guest?: number | null
          square_feet_boh?: number | null
          square_feet_foh?: number | null
          standable_pct?: number | null
          standable_sf?: number | null
          standing_capacity_final?: number | null
          standing_capacity_operational?: number | null
          total_sf?: number | null
          updated_at?: string
          use_manual_seats?: boolean | null
          use_manual_splits?: boolean | null
          utilization_factor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proforma_projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_revenue_assumptions: {
        Row: {
          avg_check_bev: number | null
          avg_check_bev_dinner: number | null
          avg_check_bev_late_night: number | null
          avg_check_bev_lunch: number | null
          avg_check_food: number | null
          avg_check_food_dinner: number | null
          avg_check_food_late_night: number | null
          avg_check_food_lunch: number | null
          avg_covers_dinner: number | null
          avg_covers_late_night: number | null
          avg_covers_lunch: number | null
          bev_mix_pct: number | null
          created_at: string
          day_of_week_distribution: number[] | null
          days_open_per_week: number
          extra: Json | null
          food_mix_pct: number | null
          other_mix_pct: number | null
          ramp_curve: Json | null
          ramp_months: number
          scenario_id: string
          seasonality_curve: Json | null
          seasonality_preset: string | null
          services_per_day: number
          updated_at: string
        }
        Insert: {
          avg_check_bev?: number | null
          avg_check_bev_dinner?: number | null
          avg_check_bev_late_night?: number | null
          avg_check_bev_lunch?: number | null
          avg_check_food?: number | null
          avg_check_food_dinner?: number | null
          avg_check_food_late_night?: number | null
          avg_check_food_lunch?: number | null
          avg_covers_dinner?: number | null
          avg_covers_late_night?: number | null
          avg_covers_lunch?: number | null
          bev_mix_pct?: number | null
          created_at?: string
          day_of_week_distribution?: number[] | null
          days_open_per_week: number
          extra?: Json | null
          food_mix_pct?: number | null
          other_mix_pct?: number | null
          ramp_curve?: Json | null
          ramp_months?: number
          scenario_id: string
          seasonality_curve?: Json | null
          seasonality_preset?: string | null
          services_per_day: number
          updated_at?: string
        }
        Update: {
          avg_check_bev?: number | null
          avg_check_bev_dinner?: number | null
          avg_check_bev_late_night?: number | null
          avg_check_bev_lunch?: number | null
          avg_check_food?: number | null
          avg_check_food_dinner?: number | null
          avg_check_food_late_night?: number | null
          avg_check_food_lunch?: number | null
          avg_covers_dinner?: number | null
          avg_covers_late_night?: number | null
          avg_covers_lunch?: number | null
          bev_mix_pct?: number | null
          created_at?: string
          day_of_week_distribution?: number[] | null
          days_open_per_week?: number
          extra?: Json | null
          food_mix_pct?: number | null
          other_mix_pct?: number | null
          ramp_curve?: Json | null
          ramp_months?: number
          scenario_id?: string
          seasonality_curve?: Json | null
          seasonality_preset?: string | null
          services_per_day?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_revenue_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_revenue_centers: {
        Row: {
          bar_mode: Database["public"]["Enums"]["bar_mode"] | null
          bar_zone_area_sqft: number | null
          bar_zone_depth_ft: number | null
          center_name: string
          created_at: string
          id: string
          is_bar: boolean | null
          is_pdr: boolean | null
          max_seats: number | null
          scenario_id: string
          seats: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          bar_mode?: Database["public"]["Enums"]["bar_mode"] | null
          bar_zone_area_sqft?: number | null
          bar_zone_depth_ft?: number | null
          center_name: string
          created_at?: string
          id?: string
          is_bar?: boolean | null
          is_pdr?: boolean | null
          max_seats?: number | null
          scenario_id: string
          seats: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bar_mode?: Database["public"]["Enums"]["bar_mode"] | null
          bar_zone_area_sqft?: number | null
          bar_zone_depth_ft?: number | null
          center_name?: string
          created_at?: string
          id?: string
          is_bar?: boolean | null
          is_pdr?: boolean | null
          max_seats?: number | null
          scenario_id?: string
          seats?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_revenue_centers_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_centers_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_centers_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_centers_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_revenue_pdr: {
        Row: {
          avg_party_size: number
          avg_spend_per_person: number
          bev_pct: number
          capacity: number
          created_at: string
          events_per_month: number
          food_pct: number
          id: string
          other_pct: number
          peak_months: number[] | null
          peak_multiplier: number | null
          ramp_months: number
          room_name: string
          scenario_id: string
        }
        Insert: {
          avg_party_size: number
          avg_spend_per_person: number
          bev_pct: number
          capacity: number
          created_at?: string
          events_per_month: number
          food_pct: number
          id?: string
          other_pct: number
          peak_months?: number[] | null
          peak_multiplier?: number | null
          ramp_months?: number
          room_name: string
          scenario_id: string
        }
        Update: {
          avg_party_size?: number
          avg_spend_per_person?: number
          bev_pct?: number
          capacity?: number
          created_at?: string
          events_per_month?: number
          food_pct?: number
          id?: string
          other_pct?: number
          peak_months?: number[] | null
          peak_multiplier?: number | null
          ramp_months?: number
          room_name?: string
          scenario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_revenue_pdr_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_pdr_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_pdr_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_pdr_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_revenue_service_periods: {
        Row: {
          avg_bev_check: number
          avg_check: number
          avg_covers_per_service: number | null
          avg_dining_time_hours: number | null
          avg_food_check: number
          bev_pct: number | null
          created_at: string
          day_of_week_distribution: number[] | null
          days_per_week: number
          default_utilization_pct: number | null
          food_pct: number | null
          id: string
          operating_days: number[] | null
          other_pct: number | null
          scenario_id: string
          service_hours: number | null
          service_name: string
          sort_order: number
        }
        Insert: {
          avg_bev_check: number
          avg_check: number
          avg_covers_per_service?: number | null
          avg_dining_time_hours?: number | null
          avg_food_check: number
          bev_pct?: number | null
          created_at?: string
          day_of_week_distribution?: number[] | null
          days_per_week: number
          default_utilization_pct?: number | null
          food_pct?: number | null
          id?: string
          operating_days?: number[] | null
          other_pct?: number | null
          scenario_id: string
          service_hours?: number | null
          service_name: string
          sort_order?: number
        }
        Update: {
          avg_bev_check?: number
          avg_check?: number
          avg_covers_per_service?: number | null
          avg_dining_time_hours?: number | null
          avg_food_check?: number
          bev_pct?: number | null
          created_at?: string
          day_of_week_distribution?: number[] | null
          days_per_week?: number
          default_utilization_pct?: number | null
          food_pct?: number | null
          id?: string
          operating_days?: number[] | null
          other_pct?: number | null
          scenario_id?: string
          service_hours?: number | null
          service_name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "proforma_revenue_service_periods_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_service_periods_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_service_periods_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_revenue_service_periods_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_scenario_adjustments: {
        Row: {
          base_scenario_id: string
          bev_cogs_pct_override: number | null
          check_avg_offset: number | null
          covers_multiplier: number | null
          created_at: string
          description: string | null
          efficiency_multiplier: number | null
          food_cogs_pct_override: number | null
          marketing_multiplier: number | null
          other_cogs_pct_override: number | null
          rent_monthly_override: number | null
          revenue_multiplier: number | null
          scenario_id: string
          updated_at: string
          utilities_multiplier: number | null
          wage_rate_offset: number | null
        }
        Insert: {
          base_scenario_id: string
          bev_cogs_pct_override?: number | null
          check_avg_offset?: number | null
          covers_multiplier?: number | null
          created_at?: string
          description?: string | null
          efficiency_multiplier?: number | null
          food_cogs_pct_override?: number | null
          marketing_multiplier?: number | null
          other_cogs_pct_override?: number | null
          rent_monthly_override?: number | null
          revenue_multiplier?: number | null
          scenario_id: string
          updated_at?: string
          utilities_multiplier?: number | null
          wage_rate_offset?: number | null
        }
        Update: {
          base_scenario_id?: string
          bev_cogs_pct_override?: number | null
          check_avg_offset?: number | null
          covers_multiplier?: number | null
          created_at?: string
          description?: string | null
          efficiency_multiplier?: number | null
          food_cogs_pct_override?: number | null
          marketing_multiplier?: number | null
          other_cogs_pct_override?: number | null
          rent_monthly_override?: number | null
          revenue_multiplier?: number | null
          scenario_id?: string
          updated_at?: string
          utilities_multiplier?: number | null
          wage_rate_offset?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proforma_scenario_adjustments_base_scenario_id_fkey"
            columns: ["base_scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_scenario_adjustments_base_scenario_id_fkey"
            columns: ["base_scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_scenario_adjustments_base_scenario_id_fkey"
            columns: ["base_scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_scenario_adjustments_base_scenario_id_fkey"
            columns: ["base_scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_scenario_adjustments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_scenario_adjustments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_scenario_adjustments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_scenario_adjustments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: true
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_scenario_labor_positions: {
        Row: {
          applies_to: string[] | null
          category: string
          created_at: string
          hourly_rate: number
          hours_per_100_covers: number
          id: string
          is_active: boolean | null
          position_name: string
          scenario_id: string
          updated_at: string
        }
        Insert: {
          applies_to?: string[] | null
          category: string
          created_at?: string
          hourly_rate: number
          hours_per_100_covers: number
          id?: string
          is_active?: boolean | null
          position_name: string
          scenario_id: string
          updated_at?: string
        }
        Update: {
          applies_to?: string[] | null
          category?: string
          created_at?: string
          hourly_rate?: number
          hours_per_100_covers?: number
          id?: string
          is_active?: boolean | null
          position_name?: string
          scenario_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_scenario_labor_positions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_covers"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_scenario_labor_positions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_cost"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_scenario_labor_positions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_monthly_labor_hours"
            referencedColumns: ["scenario_id"]
          },
          {
            foreignKeyName: "proforma_scenario_labor_positions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "proforma_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_scenarios: {
        Row: {
          created_at: string
          id: string
          is_base: boolean
          market_tier: string | null
          min_wage_city: number | null
          months: number
          name: string
          opening_month: string | null
          preopening_start_month: string | null
          project_id: string
          revenue_model: string
          scenario_type: string | null
          start_month: string
          tip_credit: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_base?: boolean
          market_tier?: string | null
          min_wage_city?: number | null
          months?: number
          name: string
          opening_month?: string | null
          preopening_start_month?: string | null
          project_id: string
          revenue_model?: string
          scenario_type?: string | null
          start_month: string
          tip_credit?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_base?: boolean
          market_tier?: string | null
          min_wage_city?: number | null
          months?: number
          name?: string
          opening_month?: string | null
          preopening_start_month?: string | null
          project_id?: string
          revenue_model?: string
          scenario_type?: string | null
          start_month?: string
          tip_credit?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proforma_scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "proforma_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_scenarios_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "proforma_standing_capacity_summary"
            referencedColumns: ["project_id"]
          },
        ]
      }
      proforma_service_period_covers: {
        Row: {
          covers_per_service: number
          created_at: string
          edit_history: Json | null
          id: string
          is_manually_edited: boolean
          last_edited_at: string | null
          last_edited_by: string | null
          revenue_center_id: string
          service_period_id: string
          updated_at: string
          version: number
        }
        Insert: {
          covers_per_service?: number
          created_at?: string
          edit_history?: Json | null
          id?: string
          is_manually_edited?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          revenue_center_id: string
          service_period_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          covers_per_service?: number
          created_at?: string
          edit_history?: Json | null
          id?: string
          is_manually_edited?: boolean
          last_edited_at?: string | null
          last_edited_by?: string | null
          revenue_center_id?: string
          service_period_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proforma_service_period_covers_revenue_center_id_fkey"
            columns: ["revenue_center_id"]
            isOneToOne: false
            referencedRelation: "proforma_revenue_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_service_period_covers_service_period_id_fkey"
            columns: ["service_period_id"]
            isOneToOne: false
            referencedRelation: "proforma_revenue_service_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_setting_presets: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_org_default: boolean | null
          is_system_default: boolean | null
          org_id: string
          preset_name: string
          settings: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_org_default?: boolean | null
          is_system_default?: boolean | null
          org_id: string
          preset_name: string
          settings: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_org_default?: boolean | null
          is_system_default?: boolean | null
          org_id?: string
          preset_name?: string
          settings?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proforma_setting_presets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_settings: {
        Row: {
          avg_days_per_month: number
          bar_inches_per_seat: number
          bar_lf_ratio: number
          bar_lounge_dining_area_pct_max: number
          bar_lounge_dining_area_pct_min: number
          bar_lounge_labor_pct_max: number
          bar_lounge_labor_pct_min: number
          bar_lounge_sf_per_seat_max: number
          bar_lounge_sf_per_seat_min: number
          bar_max_lf: number
          bar_max_pct_of_dining: number
          bar_min_lf: number
          bar_tavern_dining_pct_max: number
          bar_tavern_dining_pct_min: number
          bar_tavern_sf_per_seat_max: number
          bar_tavern_sf_per_seat_min: number
          casual_dining_dining_area_pct_max: number
          casual_dining_dining_area_pct_min: number
          casual_dining_dining_pct_max: number
          casual_dining_dining_pct_min: number
          casual_dining_labor_pct_max: number
          casual_dining_labor_pct_min: number
          casual_dining_sf_per_seat_max: number
          casual_dining_sf_per_seat_min: number
          coffee_shop_dining_pct_max: number
          coffee_shop_dining_pct_min: number
          coffee_shop_sf_per_seat_max: number
          coffee_shop_sf_per_seat_min: number
          created_at: string
          created_by: string | null
          days_per_year: number
          default_avg_dining_time_hours: number
          default_bar_active_pct: number
          default_bar_avg_spend_per_guest: number
          default_bar_bev_pct: number
          default_bar_dwell_hours: number
          default_bar_food_pct: number
          default_bar_net_to_gross: number
          default_bar_rail_ft_per_guest: number
          default_bar_utilization_pct: number
          default_bar_zone_pct: number
          default_bev_cogs_pct: number
          default_bev_mix_pct: number
          default_boh_hourly_rate: number
          default_boh_hours_per_100_covers: number
          default_boh_pct: number
          default_cc_fees_pct: number
          default_cleaning_pct: number
          default_code_sf_per_person: number
          default_concept_archetype: string
          default_density_benchmark: string
          default_dining_area_pct: number
          default_dow_friday_pct: number
          default_dow_monday_pct: number
          default_dow_saturday_pct: number
          default_dow_sunday_pct: number
          default_dow_thursday_pct: number
          default_dow_tuesday_pct: number
          default_dow_wednesday_pct: number
          default_foh_hourly_rate: number
          default_foh_hours_per_100_covers: number
          default_food_cogs_pct: number
          default_food_mix_pct: number
          default_gna_pct: number
          default_linen_pct: number
          default_market_tier: string | null
          default_marketing_pct: number
          default_min_wage_city: number | null
          default_other_cogs_pct: number
          default_other_mix_pct: number
          default_payroll_burden_pct: number
          default_pdr_avg_party_size: number
          default_pdr_avg_spend_per_person: number
          default_pdr_bev_pct: number
          default_pdr_capacity: number
          default_pdr_events_per_month: number
          default_pdr_food_pct: number
          default_pdr_other_pct: number
          default_pdr_ramp_months: number
          default_projection_years: number
          default_ramp_curve: string
          default_ramp_months: number
          default_ramp_start_pct: number
          default_realization_rate: number
          default_service_days_per_week: number
          default_service_hours: number
          default_services_per_day: number
          default_sf_per_seat: number
          default_sf_per_standing_guest: number
          default_smallwares_pct: number
          default_standable_pct: number
          default_tip_credit: number | null
          default_utilization_factor: number
          default_utilization_pct: number
          effective_from: string
          effective_to: string | null
          fast_casual_dining_area_pct_max: number
          fast_casual_dining_area_pct_min: number
          fast_casual_dining_pct_max: number
          fast_casual_dining_pct_min: number
          fast_casual_labor_pct_max: number
          fast_casual_labor_pct_min: number
          fast_casual_sf_per_seat_max: number
          fast_casual_sf_per_seat_min: number
          fine_dining_dining_area_pct_max: number
          fine_dining_dining_area_pct_min: number
          fine_dining_dining_pct_max: number
          fine_dining_dining_pct_min: number
          fine_dining_labor_pct_max: number
          fine_dining_labor_pct_min: number
          fine_dining_sf_per_seat_max: number
          fine_dining_sf_per_seat_min: number
          fiscal_calendar_type: string
          fiscal_year_start_date: string | null
          is_active: boolean
          market_tier_high_multiplier: number | null
          market_tier_low_multiplier: number | null
          market_tier_mid_multiplier: number | null
          max_rent_per_seat_warning: number
          min_boh_pct: number
          nightclub_dining_area_pct_max: number
          nightclub_dining_area_pct_min: number
          nightclub_labor_pct_max: number
          nightclub_labor_pct_min: number
          nightclub_sf_per_seat_max: number
          nightclub_sf_per_seat_min: number
          org_id: string
          premium_casual_dining_area_pct_max: number
          premium_casual_dining_area_pct_min: number
          premium_casual_labor_pct_max: number
          premium_casual_labor_pct_min: number
          premium_casual_sf_per_seat_max: number
          premium_casual_sf_per_seat_min: number
          qsr_dining_pct_max: number
          qsr_dining_pct_min: number
          qsr_sf_per_seat_max: number
          qsr_sf_per_seat_min: number
          superseded_by_org_id: string | null
          superseded_by_version: number | null
          tipped_min_wage_floor_pct: number | null
          updated_at: string
          version: number
          weeks_per_year: number
        }
        Insert: {
          avg_days_per_month?: number
          bar_inches_per_seat?: number
          bar_lf_ratio?: number
          bar_lounge_dining_area_pct_max?: number
          bar_lounge_dining_area_pct_min?: number
          bar_lounge_labor_pct_max?: number
          bar_lounge_labor_pct_min?: number
          bar_lounge_sf_per_seat_max?: number
          bar_lounge_sf_per_seat_min?: number
          bar_max_lf?: number
          bar_max_pct_of_dining?: number
          bar_min_lf?: number
          bar_tavern_dining_pct_max?: number
          bar_tavern_dining_pct_min?: number
          bar_tavern_sf_per_seat_max?: number
          bar_tavern_sf_per_seat_min?: number
          casual_dining_dining_area_pct_max?: number
          casual_dining_dining_area_pct_min?: number
          casual_dining_dining_pct_max?: number
          casual_dining_dining_pct_min?: number
          casual_dining_labor_pct_max?: number
          casual_dining_labor_pct_min?: number
          casual_dining_sf_per_seat_max?: number
          casual_dining_sf_per_seat_min?: number
          coffee_shop_dining_pct_max?: number
          coffee_shop_dining_pct_min?: number
          coffee_shop_sf_per_seat_max?: number
          coffee_shop_sf_per_seat_min?: number
          created_at?: string
          created_by?: string | null
          days_per_year?: number
          default_avg_dining_time_hours?: number
          default_bar_active_pct?: number
          default_bar_avg_spend_per_guest?: number
          default_bar_bev_pct?: number
          default_bar_dwell_hours?: number
          default_bar_food_pct?: number
          default_bar_net_to_gross?: number
          default_bar_rail_ft_per_guest?: number
          default_bar_utilization_pct?: number
          default_bar_zone_pct?: number
          default_bev_cogs_pct?: number
          default_bev_mix_pct?: number
          default_boh_hourly_rate?: number
          default_boh_hours_per_100_covers?: number
          default_boh_pct?: number
          default_cc_fees_pct?: number
          default_cleaning_pct?: number
          default_code_sf_per_person?: number
          default_concept_archetype?: string
          default_density_benchmark?: string
          default_dining_area_pct?: number
          default_dow_friday_pct?: number
          default_dow_monday_pct?: number
          default_dow_saturday_pct?: number
          default_dow_sunday_pct?: number
          default_dow_thursday_pct?: number
          default_dow_tuesday_pct?: number
          default_dow_wednesday_pct?: number
          default_foh_hourly_rate?: number
          default_foh_hours_per_100_covers?: number
          default_food_cogs_pct?: number
          default_food_mix_pct?: number
          default_gna_pct?: number
          default_linen_pct?: number
          default_market_tier?: string | null
          default_marketing_pct?: number
          default_min_wage_city?: number | null
          default_other_cogs_pct?: number
          default_other_mix_pct?: number
          default_payroll_burden_pct?: number
          default_pdr_avg_party_size?: number
          default_pdr_avg_spend_per_person?: number
          default_pdr_bev_pct?: number
          default_pdr_capacity?: number
          default_pdr_events_per_month?: number
          default_pdr_food_pct?: number
          default_pdr_other_pct?: number
          default_pdr_ramp_months?: number
          default_projection_years?: number
          default_ramp_curve?: string
          default_ramp_months?: number
          default_ramp_start_pct?: number
          default_realization_rate?: number
          default_service_days_per_week?: number
          default_service_hours?: number
          default_services_per_day?: number
          default_sf_per_seat?: number
          default_sf_per_standing_guest?: number
          default_smallwares_pct?: number
          default_standable_pct?: number
          default_tip_credit?: number | null
          default_utilization_factor?: number
          default_utilization_pct?: number
          effective_from?: string
          effective_to?: string | null
          fast_casual_dining_area_pct_max?: number
          fast_casual_dining_area_pct_min?: number
          fast_casual_dining_pct_max?: number
          fast_casual_dining_pct_min?: number
          fast_casual_labor_pct_max?: number
          fast_casual_labor_pct_min?: number
          fast_casual_sf_per_seat_max?: number
          fast_casual_sf_per_seat_min?: number
          fine_dining_dining_area_pct_max?: number
          fine_dining_dining_area_pct_min?: number
          fine_dining_dining_pct_max?: number
          fine_dining_dining_pct_min?: number
          fine_dining_labor_pct_max?: number
          fine_dining_labor_pct_min?: number
          fine_dining_sf_per_seat_max?: number
          fine_dining_sf_per_seat_min?: number
          fiscal_calendar_type?: string
          fiscal_year_start_date?: string | null
          is_active?: boolean
          market_tier_high_multiplier?: number | null
          market_tier_low_multiplier?: number | null
          market_tier_mid_multiplier?: number | null
          max_rent_per_seat_warning?: number
          min_boh_pct?: number
          nightclub_dining_area_pct_max?: number
          nightclub_dining_area_pct_min?: number
          nightclub_labor_pct_max?: number
          nightclub_labor_pct_min?: number
          nightclub_sf_per_seat_max?: number
          nightclub_sf_per_seat_min?: number
          org_id: string
          premium_casual_dining_area_pct_max?: number
          premium_casual_dining_area_pct_min?: number
          premium_casual_labor_pct_max?: number
          premium_casual_labor_pct_min?: number
          premium_casual_sf_per_seat_max?: number
          premium_casual_sf_per_seat_min?: number
          qsr_dining_pct_max?: number
          qsr_dining_pct_min?: number
          qsr_sf_per_seat_max?: number
          qsr_sf_per_seat_min?: number
          superseded_by_org_id?: string | null
          superseded_by_version?: number | null
          tipped_min_wage_floor_pct?: number | null
          updated_at?: string
          version?: number
          weeks_per_year?: number
        }
        Update: {
          avg_days_per_month?: number
          bar_inches_per_seat?: number
          bar_lf_ratio?: number
          bar_lounge_dining_area_pct_max?: number
          bar_lounge_dining_area_pct_min?: number
          bar_lounge_labor_pct_max?: number
          bar_lounge_labor_pct_min?: number
          bar_lounge_sf_per_seat_max?: number
          bar_lounge_sf_per_seat_min?: number
          bar_max_lf?: number
          bar_max_pct_of_dining?: number
          bar_min_lf?: number
          bar_tavern_dining_pct_max?: number
          bar_tavern_dining_pct_min?: number
          bar_tavern_sf_per_seat_max?: number
          bar_tavern_sf_per_seat_min?: number
          casual_dining_dining_area_pct_max?: number
          casual_dining_dining_area_pct_min?: number
          casual_dining_dining_pct_max?: number
          casual_dining_dining_pct_min?: number
          casual_dining_labor_pct_max?: number
          casual_dining_labor_pct_min?: number
          casual_dining_sf_per_seat_max?: number
          casual_dining_sf_per_seat_min?: number
          coffee_shop_dining_pct_max?: number
          coffee_shop_dining_pct_min?: number
          coffee_shop_sf_per_seat_max?: number
          coffee_shop_sf_per_seat_min?: number
          created_at?: string
          created_by?: string | null
          days_per_year?: number
          default_avg_dining_time_hours?: number
          default_bar_active_pct?: number
          default_bar_avg_spend_per_guest?: number
          default_bar_bev_pct?: number
          default_bar_dwell_hours?: number
          default_bar_food_pct?: number
          default_bar_net_to_gross?: number
          default_bar_rail_ft_per_guest?: number
          default_bar_utilization_pct?: number
          default_bar_zone_pct?: number
          default_bev_cogs_pct?: number
          default_bev_mix_pct?: number
          default_boh_hourly_rate?: number
          default_boh_hours_per_100_covers?: number
          default_boh_pct?: number
          default_cc_fees_pct?: number
          default_cleaning_pct?: number
          default_code_sf_per_person?: number
          default_concept_archetype?: string
          default_density_benchmark?: string
          default_dining_area_pct?: number
          default_dow_friday_pct?: number
          default_dow_monday_pct?: number
          default_dow_saturday_pct?: number
          default_dow_sunday_pct?: number
          default_dow_thursday_pct?: number
          default_dow_tuesday_pct?: number
          default_dow_wednesday_pct?: number
          default_foh_hourly_rate?: number
          default_foh_hours_per_100_covers?: number
          default_food_cogs_pct?: number
          default_food_mix_pct?: number
          default_gna_pct?: number
          default_linen_pct?: number
          default_market_tier?: string | null
          default_marketing_pct?: number
          default_min_wage_city?: number | null
          default_other_cogs_pct?: number
          default_other_mix_pct?: number
          default_payroll_burden_pct?: number
          default_pdr_avg_party_size?: number
          default_pdr_avg_spend_per_person?: number
          default_pdr_bev_pct?: number
          default_pdr_capacity?: number
          default_pdr_events_per_month?: number
          default_pdr_food_pct?: number
          default_pdr_other_pct?: number
          default_pdr_ramp_months?: number
          default_projection_years?: number
          default_ramp_curve?: string
          default_ramp_months?: number
          default_ramp_start_pct?: number
          default_realization_rate?: number
          default_service_days_per_week?: number
          default_service_hours?: number
          default_services_per_day?: number
          default_sf_per_seat?: number
          default_sf_per_standing_guest?: number
          default_smallwares_pct?: number
          default_standable_pct?: number
          default_tip_credit?: number | null
          default_utilization_factor?: number
          default_utilization_pct?: number
          effective_from?: string
          effective_to?: string | null
          fast_casual_dining_area_pct_max?: number
          fast_casual_dining_area_pct_min?: number
          fast_casual_dining_pct_max?: number
          fast_casual_dining_pct_min?: number
          fast_casual_labor_pct_max?: number
          fast_casual_labor_pct_min?: number
          fast_casual_sf_per_seat_max?: number
          fast_casual_sf_per_seat_min?: number
          fine_dining_dining_area_pct_max?: number
          fine_dining_dining_area_pct_min?: number
          fine_dining_dining_pct_max?: number
          fine_dining_dining_pct_min?: number
          fine_dining_labor_pct_max?: number
          fine_dining_labor_pct_min?: number
          fine_dining_sf_per_seat_max?: number
          fine_dining_sf_per_seat_min?: number
          fiscal_calendar_type?: string
          fiscal_year_start_date?: string | null
          is_active?: boolean
          market_tier_high_multiplier?: number | null
          market_tier_low_multiplier?: number | null
          market_tier_mid_multiplier?: number | null
          max_rent_per_seat_warning?: number
          min_boh_pct?: number
          nightclub_dining_area_pct_max?: number
          nightclub_dining_area_pct_min?: number
          nightclub_labor_pct_max?: number
          nightclub_labor_pct_min?: number
          nightclub_sf_per_seat_max?: number
          nightclub_sf_per_seat_min?: number
          org_id?: string
          premium_casual_dining_area_pct_max?: number
          premium_casual_dining_area_pct_min?: number
          premium_casual_labor_pct_max?: number
          premium_casual_labor_pct_min?: number
          premium_casual_sf_per_seat_max?: number
          premium_casual_sf_per_seat_min?: number
          qsr_dining_pct_max?: number
          qsr_dining_pct_min?: number
          qsr_sf_per_seat_max?: number
          qsr_sf_per_seat_min?: number
          superseded_by_org_id?: string | null
          superseded_by_version?: number | null
          tipped_min_wage_floor_pct?: number | null
          updated_at?: string
          version?: number
          weeks_per_year?: number
        }
        Relationships: [
          {
            foreignKeyName: "proforma_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_settings_superseded_by_fkey"
            columns: ["superseded_by_org_id", "superseded_by_version"]
            isOneToOne: false
            referencedRelation: "proforma_settings"
            referencedColumns: ["org_id", "version"]
          },
        ]
      }
      proforma_validation_rules: {
        Row: {
          concept_type: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean | null
          market_tier: string | null
          max_value: number | null
          message_template: string
          metric: string
          min_value: number | null
          operator_tier: string | null
          severity: string
          tenant_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          concept_type?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          market_tier?: string | null
          max_value?: number | null
          message_template: string
          metric: string
          min_value?: number | null
          operator_tier?: string | null
          severity?: string
          tenant_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          concept_type?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          market_tier?: string | null
          max_value?: number | null
          message_template?: string
          metric?: string
          min_value?: number | null
          operator_tier?: string | null
          severity?: string
          tenant_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          line_total: number | null
          notes: string | null
          purchase_order_id: string
          qty_received: number | null
          quantity: number
          remaining_qty: number | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          line_total?: number | null
          notes?: string | null
          purchase_order_id: string
          qty_received?: number | null
          quantity: number
          remaining_qty?: number | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          line_total?: number | null
          notes?: string | null
          purchase_order_id?: string
          qty_received?: number | null
          quantity?: number
          remaining_qty?: number | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "three_way_match"
            referencedColumns: ["po_id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          delivery_date: string | null
          id: string
          notes: string | null
          order_date: string | null
          order_number: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          total_amount: number | null
          updated_at: string | null
          vendor_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_number?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_number?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "purchase_orders_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      realtime_adjustments: {
        Row: {
          action_type: string
          adjustment_time: string
          business_date: string
          cost_savings: number | null
          covers_at_decision: number | null
          created_at: string
          employee_id: string
          employee_name: string | null
          employee_response: string | null
          executed_by: string | null
          forecast_covers: number | null
          hours_change: number | null
          id: string
          new_end_time: string | null
          notified_employee: boolean | null
          original_end_time: string | null
          position: string | null
          reason: string
          shift_assignment_id: string | null
          venue_id: string
        }
        Insert: {
          action_type: string
          adjustment_time?: string
          business_date: string
          cost_savings?: number | null
          covers_at_decision?: number | null
          created_at?: string
          employee_id: string
          employee_name?: string | null
          employee_response?: string | null
          executed_by?: string | null
          forecast_covers?: number | null
          hours_change?: number | null
          id?: string
          new_end_time?: string | null
          notified_employee?: boolean | null
          original_end_time?: string | null
          position?: string | null
          reason: string
          shift_assignment_id?: string | null
          venue_id: string
        }
        Update: {
          action_type?: string
          adjustment_time?: string
          business_date?: string
          cost_savings?: number | null
          covers_at_decision?: number | null
          created_at?: string
          employee_id?: string
          employee_name?: string | null
          employee_response?: string | null
          executed_by?: string | null
          forecast_covers?: number | null
          hours_change?: number | null
          id?: string
          new_end_time?: string | null
          notified_employee?: boolean | null
          original_end_time?: string | null
          position?: string | null
          reason?: string
          shift_assignment_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "realtime_adjustments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "realtime_adjustments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_lines: {
        Row: {
          created_at: string | null
          id: string
          invoice_line_id: string | null
          item_id: string | null
          line_total: number | null
          match_confidence:
            | Database["public"]["Enums"]["match_confidence"]
            | null
          price_variance_pct: number | null
          purchase_order_item_id: string | null
          qty_received: number
          qty_variance_pct: number | null
          receipt_id: string
          unit_cost: number
          variance_notes: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invoice_line_id?: string | null
          item_id?: string | null
          line_total?: number | null
          match_confidence?:
            | Database["public"]["Enums"]["match_confidence"]
            | null
          price_variance_pct?: number | null
          purchase_order_item_id?: string | null
          qty_received: number
          qty_variance_pct?: number | null
          receipt_id: string
          unit_cost: number
          variance_notes?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          invoice_line_id?: string | null
          item_id?: string | null
          line_total?: number | null
          match_confidence?:
            | Database["public"]["Enums"]["match_confidence"]
            | null
          price_variance_pct?: number | null
          purchase_order_item_id?: string | null
          qty_received?: number
          qty_variance_pct?: number | null
          receipt_id?: string
          unit_cost?: number
          variance_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_lines_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_lines_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "three_way_match"
            referencedColumns: ["receipt_id"]
          },
        ]
      }
      receipts: {
        Row: {
          auto_generated: boolean | null
          created_at: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          purchase_order_id: string | null
          received_at: string | null
          received_by: string | null
          status: Database["public"]["Enums"]["receipt_status"] | null
          total_amount: number | null
          updated_at: string | null
          vendor_id: string
          venue_id: string
        }
        Insert: {
          auto_generated?: boolean | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["receipt_status"] | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id: string
          venue_id: string
        }
        Update: {
          auto_generated?: boolean | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          received_at?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["receipt_status"] | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "three_way_match"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "receipts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "receipts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          created_at: string | null
          id: string
          is_packaging: boolean | null
          item_id: string | null
          qty: number
          recipe_id: string
          sub_recipe_id: string | null
          uom: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_packaging?: boolean | null
          item_id?: string | null
          qty: number
          recipe_id: string
          sub_recipe_id?: string | null
          uom: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_packaging?: boolean | null
          item_id?: string | null
          qty?: number
          recipe_id?: string
          sub_recipe_id?: string | null
          uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_cost_rollup"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "recipe_items_sub_recipe_id_fkey"
            columns: ["sub_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_sub_recipe_id_fkey"
            columns: ["sub_recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_cost_rollup"
            referencedColumns: ["recipe_id"]
          },
        ]
      }
      recipes: {
        Row: {
          category: string | null
          cost_per_unit: number | null
          created_at: string | null
          created_by: string | null
          food_cost_target: number | null
          id: string
          is_active: boolean | null
          item_category: string | null
          labor_minutes: number | null
          menu_price: number | null
          name: string
          notes: string | null
          pos_sku: string | null
          prep_loss_pct: number | null
          recipe_type: Database["public"]["Enums"]["recipe_type"] | null
          updated_at: string | null
          venue_id: string | null
          yield_qty: number
          yield_uom: string
        }
        Insert: {
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          created_by?: string | null
          food_cost_target?: number | null
          id?: string
          is_active?: boolean | null
          item_category?: string | null
          labor_minutes?: number | null
          menu_price?: number | null
          name: string
          notes?: string | null
          pos_sku?: string | null
          prep_loss_pct?: number | null
          recipe_type?: Database["public"]["Enums"]["recipe_type"] | null
          updated_at?: string | null
          venue_id?: string | null
          yield_qty?: number
          yield_uom: string
        }
        Update: {
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          created_by?: string | null
          food_cost_target?: number | null
          id?: string
          is_active?: boolean | null
          item_category?: string | null
          labor_minutes?: number | null
          menu_price?: number | null
          name?: string
          notes?: string | null
          pos_sku?: string | null
          prep_loss_pct?: number | null
          recipe_type?: Database["public"]["Enums"]["recipe_type"] | null
          updated_at?: string | null
          venue_id?: string | null
          yield_qty?: number
          yield_uom?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "recipes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_snapshots: {
        Row: {
          actual_covers: number | null
          business_date: string
          confirmed_covers: number
          created_at: string | null
          hours_to_service: number
          id: string
          pending_covers: number | null
          snapshot_at: string
          total_on_books: number | null
          venue_id: string
          waitlist_covers: number | null
        }
        Insert: {
          actual_covers?: number | null
          business_date: string
          confirmed_covers?: number
          created_at?: string | null
          hours_to_service: number
          id?: string
          pending_covers?: number | null
          snapshot_at?: string
          total_on_books?: number | null
          venue_id: string
          waitlist_covers?: number | null
        }
        Update: {
          actual_covers?: number | null
          business_date?: string
          confirmed_covers?: number
          created_at?: string | null
          hours_to_service?: number
          id?: string
          pending_covers?: number | null
          snapshot_at?: string
          total_on_books?: number | null
          venue_id?: string
          waitlist_covers?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "reservation_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_centers: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          is_primary: boolean | null
          name: string
          project_id: string
          total_seats: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          name: string
          project_id: string
          total_seats?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_primary?: boolean | null
          name?: string
          project_id?: string
          total_seats?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_centers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "proforma_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_centers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "proforma_standing_capacity_summary"
            referencedColumns: ["project_id"]
          },
        ]
      }
      reviews_raw: {
        Row: {
          content: string | null
          content_hash: string | null
          has_reply: boolean
          id: string
          ingested_at: string
          rating: number | null
          reply_count: number
          reviewed_at: string
          source: string
          source_review_id: string
          tags: string[] | null
          thirdparty_id: string | null
          thirdparty_url: string | null
          tipsee_id: number | null
          venue_id: string
        }
        Insert: {
          content?: string | null
          content_hash?: string | null
          has_reply?: boolean
          id?: string
          ingested_at?: string
          rating?: number | null
          reply_count?: number
          reviewed_at: string
          source: string
          source_review_id: string
          tags?: string[] | null
          thirdparty_id?: string | null
          thirdparty_url?: string | null
          tipsee_id?: number | null
          venue_id: string
        }
        Update: {
          content?: string | null
          content_hash?: string | null
          has_reply?: boolean
          id?: string
          ingested_at?: string
          rating?: number | null
          reply_count?: number
          reviewed_at?: string
          source?: string
          source_review_id?: string
          tags?: string[] | null
          thirdparty_id?: string | null
          thirdparty_url?: string | null
          tipsee_id?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_raw_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "reviews_raw_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_adjustments: {
        Row: {
          adjustment_type: string
          approved_at: string | null
          approved_by: string | null
          business_date: string
          created_at: string
          current_forecast_covers: number | null
          decision_reason: string | null
          employee_id: string | null
          employee_name: string | null
          executed_at: string | null
          hours_until_shift: number | null
          id: string
          labor_cost_change: number | null
          net_benefit: number | null
          original_forecast_covers: number | null
          penalty_cost: number | null
          penalty_hours: number | null
          penalty_type: string | null
          position: string | null
          recommended: boolean | null
          review_id: string
          shift_assignment_id: string | null
          status: string
          variance_percentage: number | null
          variance_reason: string | null
          venue_id: string
        }
        Insert: {
          adjustment_type: string
          approved_at?: string | null
          approved_by?: string | null
          business_date: string
          created_at?: string
          current_forecast_covers?: number | null
          decision_reason?: string | null
          employee_id?: string | null
          employee_name?: string | null
          executed_at?: string | null
          hours_until_shift?: number | null
          id?: string
          labor_cost_change?: number | null
          net_benefit?: number | null
          original_forecast_covers?: number | null
          penalty_cost?: number | null
          penalty_hours?: number | null
          penalty_type?: string | null
          position?: string | null
          recommended?: boolean | null
          review_id: string
          shift_assignment_id?: string | null
          status?: string
          variance_percentage?: number | null
          variance_reason?: string | null
          venue_id: string
        }
        Update: {
          adjustment_type?: string
          approved_at?: string | null
          approved_by?: string | null
          business_date?: string
          created_at?: string
          current_forecast_covers?: number | null
          decision_reason?: string | null
          employee_id?: string | null
          employee_name?: string | null
          executed_at?: string | null
          hours_until_shift?: number | null
          id?: string
          labor_cost_change?: number | null
          net_benefit?: number | null
          original_forecast_covers?: number | null
          penalty_cost?: number | null
          penalty_hours?: number | null
          penalty_type?: string | null
          position?: string | null
          recommended?: boolean | null
          review_id?: string
          shift_assignment_id?: string | null
          status?: string
          variance_percentage?: number | null
          variance_reason?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_adjustments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "forecast_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_adjustments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "schedule_adjustments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_approvals: {
        Row: {
          approval_notes: string | null
          approved_at: string
          approved_by: string
          changes_made: Json | null
          created_at: string | null
          id: string
          new_status: string | null
          previous_status: string | null
          schedule_id: string
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string
          approved_by: string
          changes_made?: Json | null
          created_at?: string | null
          id?: string
          new_status?: string | null
          previous_status?: string | null
          schedule_id: string
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string
          approved_by?: string
          changes_made?: Json | null
          created_at?: string | null
          id?: string
          new_status?: string | null
          previous_status?: string | null
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_approvals_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "weekly_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_optimization_results: {
        Row: {
          alternative_scenarios: Json | null
          avg_cplh_by_shift: Json | null
          constraints_satisfied: number | null
          constraints_violated: number | null
          cost_savings_vs_baseline: number | null
          cplh_variance_from_target: number | null
          created_at: string
          estimated_margin_improvement: number | null
          id: string
          labor_percentage: number
          labor_percentage_variance: number | null
          optimization_mode: string
          overall_cplh: number
          projected_covers: number
          projected_revenue: number
          quality_violations: Json | null
          quality_warnings: Json | null
          schedule_id: string
          service_quality_score: number
          solver_status: string
          solver_time_seconds: number | null
          total_labor_cost: number
          total_labor_hours: number
          venue_id: string
        }
        Insert: {
          alternative_scenarios?: Json | null
          avg_cplh_by_shift?: Json | null
          constraints_satisfied?: number | null
          constraints_violated?: number | null
          cost_savings_vs_baseline?: number | null
          cplh_variance_from_target?: number | null
          created_at?: string
          estimated_margin_improvement?: number | null
          id?: string
          labor_percentage: number
          labor_percentage_variance?: number | null
          optimization_mode: string
          overall_cplh: number
          projected_covers: number
          projected_revenue: number
          quality_violations?: Json | null
          quality_warnings?: Json | null
          schedule_id: string
          service_quality_score: number
          solver_status: string
          solver_time_seconds?: number | null
          total_labor_cost: number
          total_labor_hours: number
          venue_id: string
        }
        Update: {
          alternative_scenarios?: Json | null
          avg_cplh_by_shift?: Json | null
          constraints_satisfied?: number | null
          constraints_violated?: number | null
          cost_savings_vs_baseline?: number | null
          cplh_variance_from_target?: number | null
          created_at?: string
          estimated_margin_improvement?: number | null
          id?: string
          labor_percentage?: number
          labor_percentage_variance?: number | null
          optimization_mode?: string
          overall_cplh?: number
          projected_covers?: number
          projected_revenue?: number
          quality_violations?: Json | null
          quality_warnings?: Json | null
          schedule_id?: string
          service_quality_score?: number
          solver_status?: string
          solver_time_seconds?: number | null
          total_labor_cost?: number
          total_labor_hours?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_optimization_results_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "weekly_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_optimization_results_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "schedule_optimization_results_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          template_data: Json
          template_type: string
          updated_at: string
          use_count: number | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name: string
          template_data: Json
          template_type: string
          updated_at?: string
          use_count?: number | null
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          template_data?: Json
          template_type?: string
          updated_at?: string
          use_count?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_templates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "schedule_templates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_calendar: {
        Row: {
          covers_multiplier: number
          created_at: string
          event_date: string
          event_name: string
          event_type: string
          hourly_multipliers: Json | null
          id: string
          is_recurring: boolean | null
          notes: string | null
          recurring_day: number | null
          recurring_month: number | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          covers_multiplier?: number
          created_at?: string
          event_date: string
          event_name: string
          event_type: string
          hourly_multipliers?: Json | null
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          recurring_day?: number | null
          recurring_month?: number | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          covers_multiplier?: number
          created_at?: string
          event_date?: string
          event_name?: string
          event_type?: string
          hourly_multipliers?: Json | null
          id?: string
          is_recurring?: boolean | null
          notes?: string | null
          recurring_day?: number | null
          recurring_month?: number | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_calendar_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "seasonal_calendar_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      server_day_facts: {
        Row: {
          avg_check: number | null
          avg_per_cover: number | null
          avg_turn_mins: number | null
          business_date: string
          checks_count: number
          comps_total: number | null
          covers_count: number
          created_at: string | null
          employee_name: string
          employee_role: string | null
          etl_run_id: string | null
          gross_sales: number
          id: string
          last_synced_at: string
          tips_total: number | null
          venue_id: string
        }
        Insert: {
          avg_check?: number | null
          avg_per_cover?: number | null
          avg_turn_mins?: number | null
          business_date: string
          checks_count?: number
          comps_total?: number | null
          covers_count?: number
          created_at?: string | null
          employee_name: string
          employee_role?: string | null
          etl_run_id?: string | null
          gross_sales?: number
          id?: string
          last_synced_at?: string
          tips_total?: number | null
          venue_id: string
        }
        Update: {
          avg_check?: number | null
          avg_per_cover?: number | null
          avg_turn_mins?: number | null
          business_date?: string
          checks_count?: number
          comps_total?: number | null
          covers_count?: number
          created_at?: string | null
          employee_name?: string
          employee_role?: string | null
          etl_run_id?: string | null
          gross_sales?: number
          id?: string
          last_synced_at?: string
          tips_total?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_day_facts_etl_run_id_fkey"
            columns: ["etl_run_id"]
            isOneToOne: false
            referencedRelation: "etl_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "server_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      service_periods: {
        Row: {
          avg_check: number | null
          created_at: string | null
          days_per_week: number | null
          display_order: number | null
          id: string
          name: string
          project_id: string
          turns_per_day: number | null
          updated_at: string | null
        }
        Insert: {
          avg_check?: number | null
          created_at?: string | null
          days_per_week?: number | null
          display_order?: number | null
          id?: string
          name: string
          project_id: string
          turns_per_day?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_check?: number | null
          created_at?: string | null
          days_per_week?: number | null
          display_order?: number | null
          id?: string
          name?: string
          project_id?: string
          turns_per_day?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_periods_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "proforma_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_periods_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "proforma_standing_capacity_summary"
            referencedColumns: ["project_id"]
          },
        ]
      }
      service_quality_standards: {
        Row: {
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          is_active: boolean | null
          max_covers_per_server: number
          max_tables_per_server: number
          min_busser_to_server_ratio: number
          min_runner_to_server_ratio: number
          min_service_quality_score: number | null
          min_sommelier_covers_threshold: number | null
          quality_priority_weight: number | null
          service_tier: string
          shift_type: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          max_covers_per_server?: number
          max_tables_per_server?: number
          min_busser_to_server_ratio?: number
          min_runner_to_server_ratio?: number
          min_service_quality_score?: number | null
          min_sommelier_covers_threshold?: number | null
          quality_priority_weight?: number | null
          service_tier?: string
          shift_type?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          is_active?: boolean | null
          max_covers_per_server?: number
          max_tables_per_server?: number
          min_busser_to_server_ratio?: number
          min_runner_to_server_ratio?: number
          min_service_quality_score?: number | null
          min_sommelier_covers_threshold?: number | null
          quality_priority_weight?: number | null
          service_tier?: string
          shift_type?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_quality_standards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "service_quality_standards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      service_standards: {
        Row: {
          covers_per_employee: number | null
          covers_threshold: number | null
          created_at: string
          id: string
          is_active: boolean | null
          max_on_duty: number | null
          min_on_duty: number | null
          min_shift_hours: number | null
          optimal_shift_hours: number | null
          position: string
          ratio_multiplier: number | null
          ratio_to_position: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          covers_per_employee?: number | null
          covers_threshold?: number | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_on_duty?: number | null
          min_on_duty?: number | null
          min_shift_hours?: number | null
          optimal_shift_hours?: number | null
          position: string
          ratio_multiplier?: number | null
          ratio_to_position?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          covers_per_employee?: number | null
          covers_threshold?: number | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          max_on_duty?: number | null
          min_on_duty?: number | null
          min_shift_hours?: number | null
          optimal_shift_hours?: number | null
          position?: string
          ratio_multiplier?: number | null
          ratio_to_position?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_standards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "service_standards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      settings_audit_log: {
        Row: {
          change_reason: string | null
          changed_at: string
          field_name: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          record_id: string
          table_name: string
          user_agent: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          field_name: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          record_id: string
          table_name: string
          user_agent?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          field_name?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string
          table_name?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      shift_assignments: {
        Row: {
          actual_cost: number | null
          actual_end: string | null
          actual_hours: number | null
          actual_start: string | null
          break_minutes: number | null
          business_date: string
          created_at: string
          employee_id: string
          hourly_rate: number | null
          id: string
          is_modified: boolean | null
          modification_reason: string | null
          modified_at: string | null
          modified_by: string | null
          notes: string | null
          planned_covers: number | null
          planned_cplh: number | null
          position_id: string
          schedule_id: string
          scheduled_cost: number | null
          scheduled_end: string
          scheduled_hours: number
          scheduled_start: string
          service_quality_contribution: number | null
          shift_type: string
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          break_minutes?: number | null
          business_date: string
          created_at?: string
          employee_id: string
          hourly_rate?: number | null
          id?: string
          is_modified?: boolean | null
          modification_reason?: string | null
          modified_at?: string | null
          modified_by?: string | null
          notes?: string | null
          planned_covers?: number | null
          planned_cplh?: number | null
          position_id: string
          schedule_id: string
          scheduled_cost?: number | null
          scheduled_end: string
          scheduled_hours: number
          scheduled_start: string
          service_quality_contribution?: number | null
          shift_type: string
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_hours?: number | null
          actual_start?: string | null
          break_minutes?: number | null
          business_date?: string
          created_at?: string
          employee_id?: string
          hourly_rate?: number | null
          id?: string
          is_modified?: boolean | null
          modification_reason?: string | null
          modified_at?: string | null
          modified_by?: string | null
          notes?: string | null
          planned_covers?: number | null
          planned_cplh?: number | null
          position_id?: string
          schedule_id?: string
          scheduled_cost?: number | null
          scheduled_end?: string
          scheduled_hours?: number
          scheduled_start?: string
          service_quality_contribution?: number | null
          shift_type?: string
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "cplh_by_position_shift"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "shift_assignments_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "weekly_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "shift_assignments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_monitoring: {
        Row: {
          business_date: string
          created_at: string
          current_covers: number
          current_labor_cost: number | null
          current_revenue: number
          current_staff_count: number
          forecasted_covers: number | null
          id: string
          recommended_action: string | null
          recommended_details: Json | null
          shift_type: string
          snapshot_time: string
          variance_from_forecast: number | null
          venue_id: string
        }
        Insert: {
          business_date: string
          created_at?: string
          current_covers: number
          current_labor_cost?: number | null
          current_revenue: number
          current_staff_count: number
          forecasted_covers?: number | null
          id?: string
          recommended_action?: string | null
          recommended_details?: Json | null
          shift_type: string
          snapshot_time?: string
          variance_from_forecast?: number | null
          venue_id: string
        }
        Update: {
          business_date?: string
          created_at?: string
          current_covers?: number
          current_labor_cost?: number | null
          current_revenue?: number
          current_staff_count?: number
          forecasted_covers?: number | null
          id?: string
          recommended_action?: string | null
          recommended_details?: Json | null
          shift_type?: string
          snapshot_time?: string
          variance_from_forecast?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_monitoring_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "shift_monitoring_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_swap_requests: {
        Row: {
          accepted_by_employee_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          manager_notes: string | null
          notes: string | null
          original_shift_id: string
          reason: string | null
          requesting_employee_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          swap_type: string
          target_employee_id: string | null
          target_shift_id: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          accepted_by_employee_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          manager_notes?: string | null
          notes?: string | null
          original_shift_id: string
          reason?: string | null
          requesting_employee_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          swap_type: string
          target_employee_id?: string | null
          target_shift_id?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          accepted_by_employee_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          manager_notes?: string | null
          notes?: string | null
          original_shift_id?: string
          reason?: string | null
          requesting_employee_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          swap_type?: string
          target_employee_id?: string | null
          target_shift_id?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_swap_requests_original_shift_id_fkey"
            columns: ["original_shift_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_requesting_employee_id_fkey"
            columns: ["requesting_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_target_employee_id_fkey"
            columns: ["target_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_target_shift_id_fkey"
            columns: ["target_shift_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "shift_swap_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          is_default: boolean | null
          items: Json | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          is_default?: boolean | null
          items?: Json | null
          name?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          is_default?: boolean | null
          items?: Json | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      signals: {
        Row: {
          business_date: string
          confidence: number | null
          created_at: string
          dedupe_key: string
          detected_at: string
          detected_run_id: string | null
          domain: Database["public"]["Enums"]["feedback_domain"]
          entity_id: string | null
          entity_type: string | null
          id: string
          impact_unit: string | null
          impact_value: number | null
          org_id: string
          payload: Json
          severity: Database["public"]["Enums"]["feedback_severity"]
          signal_type: string
          source: Database["public"]["Enums"]["signal_source"]
          venue_id: string | null
        }
        Insert: {
          business_date: string
          confidence?: number | null
          created_at?: string
          dedupe_key: string
          detected_at?: string
          detected_run_id?: string | null
          domain: Database["public"]["Enums"]["feedback_domain"]
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          impact_unit?: string | null
          impact_value?: number | null
          org_id: string
          payload?: Json
          severity?: Database["public"]["Enums"]["feedback_severity"]
          signal_type: string
          source?: Database["public"]["Enums"]["signal_source"]
          venue_id?: string | null
        }
        Update: {
          business_date?: string
          confidence?: number | null
          created_at?: string
          dedupe_key?: string
          detected_at?: string
          detected_run_id?: string | null
          domain?: Database["public"]["Enums"]["feedback_domain"]
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          impact_unit?: string | null
          impact_value?: number | null
          org_id?: string
          payload?: Json
          severity?: Database["public"]["Enums"]["feedback_severity"]
          signal_type?: string
          source?: Database["public"]["Enums"]["signal_source"]
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "signals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      source_day_snapshot: {
        Row: {
          business_date: string
          etl_run_id: string | null
          extracted_at: string
          id: string
          raw_hash: string | null
          source_gross_sales: number | null
          source_net_sales: number | null
          source_system: string
          source_total_checks: number | null
          source_total_comps: number | null
          source_total_covers: number | null
          source_total_tax: number | null
          source_total_voids: number | null
          venue_id: string
        }
        Insert: {
          business_date: string
          etl_run_id?: string | null
          extracted_at?: string
          id?: string
          raw_hash?: string | null
          source_gross_sales?: number | null
          source_net_sales?: number | null
          source_system?: string
          source_total_checks?: number | null
          source_total_comps?: number | null
          source_total_covers?: number | null
          source_total_tax?: number | null
          source_total_voids?: number | null
          venue_id: string
        }
        Update: {
          business_date?: string
          etl_run_id?: string | null
          extracted_at?: string
          id?: string
          raw_hash?: string | null
          source_gross_sales?: number | null
          source_net_sales?: number | null
          source_system?: string
          source_total_checks?: number | null
          source_total_comps?: number | null
          source_total_covers?: number | null
          source_total_tax?: number | null
          source_total_voids?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_day_snapshot_etl_run_id_fkey"
            columns: ["etl_run_id"]
            isOneToOne: false
            referencedRelation: "etl_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_day_snapshot_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "source_day_snapshot_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_alerts: {
        Row: {
          actual_covers: number | null
          actual_servers: number | null
          alert_date: string
          alert_type: string
          created_at: string
          delta: number | null
          hour_slot: number | null
          id: string
          is_resolved: boolean | null
          message: string
          recommended_servers: number | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          venue_id: string
        }
        Insert: {
          actual_covers?: number | null
          actual_servers?: number | null
          alert_date: string
          alert_type: string
          created_at?: string
          delta?: number | null
          hour_slot?: number | null
          id?: string
          is_resolved?: boolean | null
          message: string
          recommended_servers?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          venue_id: string
        }
        Update: {
          actual_covers?: number | null
          actual_servers?: number | null
          alert_date?: string
          alert_type?: string
          created_at?: string
          delta?: number | null
          hour_slot?: number | null
          id?: string
          is_resolved?: boolean | null
          message?: string
          recommended_servers?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_alerts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "staffing_alerts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_patterns: {
        Row: {
          analyzed_shifts: number | null
          avg_labor_percentage: number | null
          confidence_score: number | null
          covers_max: number
          covers_min: number
          created_at: string
          date_range_end: string | null
          date_range_start: string | null
          day_of_week: number | null
          employees_recommended: number
          id: string
          is_active: boolean | null
          model_version: string
          position_id: string
          sample_size: number | null
          shift_type: string
          trained_at: string
          venue_id: string
        }
        Insert: {
          analyzed_shifts?: number | null
          avg_labor_percentage?: number | null
          confidence_score?: number | null
          covers_max: number
          covers_min: number
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          day_of_week?: number | null
          employees_recommended: number
          id?: string
          is_active?: boolean | null
          model_version: string
          position_id: string
          sample_size?: number | null
          shift_type: string
          trained_at?: string
          venue_id: string
        }
        Update: {
          analyzed_shifts?: number | null
          avg_labor_percentage?: number | null
          confidence_score?: number | null
          covers_max?: number
          covers_min?: number
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          day_of_week?: number | null
          employees_recommended?: number
          id?: string
          is_active?: boolean | null
          model_version?: string
          position_id?: string
          sample_size?: number | null
          shift_type?: string
          trained_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_patterns_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "cplh_by_position_shift"
            referencedColumns: ["position_id"]
          },
          {
            foreignKeyName: "staffing_patterns_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_patterns_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "staffing_patterns_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_profiles: {
        Row: {
          avg_active_covers: number | null
          avg_new_covers: number | null
          bartenders_buffered: number | null
          bartenders_lean: number | null
          bartenders_safe: number | null
          built_at: string
          created_at: string
          date_range_end: string | null
          date_range_start: string | null
          day_of_week: number
          hour_slot: number
          id: string
          max_active_covers: number | null
          p50_active_covers: number | null
          p75_active_covers: number | null
          p75_new_covers: number | null
          p90_active_covers: number | null
          profile_version: number
          sample_count: number
          servers_buffered: number | null
          servers_lean: number | null
          servers_safe: number | null
          stddev_active_covers: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          avg_active_covers?: number | null
          avg_new_covers?: number | null
          bartenders_buffered?: number | null
          bartenders_lean?: number | null
          bartenders_safe?: number | null
          built_at?: string
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          day_of_week: number
          hour_slot: number
          id?: string
          max_active_covers?: number | null
          p50_active_covers?: number | null
          p75_active_covers?: number | null
          p75_new_covers?: number | null
          p90_active_covers?: number | null
          profile_version?: number
          sample_count?: number
          servers_buffered?: number | null
          servers_lean?: number | null
          servers_safe?: number | null
          stddev_active_covers?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          avg_active_covers?: number | null
          avg_new_covers?: number | null
          bartenders_buffered?: number | null
          bartenders_lean?: number | null
          bartenders_safe?: number | null
          built_at?: string
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          day_of_week?: number
          hour_slot?: number
          id?: string
          max_active_covers?: number | null
          p50_active_covers?: number | null
          p75_active_covers?: number | null
          p75_new_covers?: number | null
          p90_active_covers?: number | null
          profile_version?: number
          sample_count?: number
          servers_buffered?: number | null
          servers_lean?: number | null
          servers_safe?: number | null
          stddev_active_covers?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_profiles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "staffing_profiles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      standards: {
        Row: {
          bounds: Json | null
          created_at: string
          created_by: string | null
          domain: Database["public"]["Enums"]["feedback_domain"]
          effective_from: string
          effective_to: string | null
          id: string
          org_id: string
          standard_key: string
          superseded_by: string | null
          value: Json
          venue_id: string | null
          version: number
        }
        Insert: {
          bounds?: Json | null
          created_at?: string
          created_by?: string | null
          domain: Database["public"]["Enums"]["feedback_domain"]
          effective_from?: string
          effective_to?: string | null
          id?: string
          org_id: string
          standard_key: string
          superseded_by?: string | null
          value: Json
          venue_id?: string | null
          version?: number
        }
        Update: {
          bounds?: Json | null
          created_at?: string
          created_by?: string | null
          domain?: Database["public"]["Enums"]["feedback_domain"]
          effective_from?: string
          effective_to?: string | null
          id?: string
          org_id?: string
          standard_key?: string
          superseded_by?: string | null
          value?: Json
          venue_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "standards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standards_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "standards_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      synced_emails: {
        Row: {
          created_at: string
          email_from: string | null
          email_message_id: string
          email_received_at: string
          email_subject: string | null
          email_sync_config_id: string
          id: string
          invoice_id: string | null
          organization_id: string
          processed: boolean
          processed_at: string | null
          processing_error: string | null
          retry_count: number | null
        }
        Insert: {
          created_at?: string
          email_from?: string | null
          email_message_id: string
          email_received_at: string
          email_subject?: string | null
          email_sync_config_id: string
          id?: string
          invoice_id?: string | null
          organization_id: string
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          retry_count?: number | null
        }
        Update: {
          created_at?: string
          email_from?: string | null
          email_message_id?: string
          email_received_at?: string
          email_subject?: string | null
          email_sync_config_id?: string
          id?: string
          invoice_id?: string | null
          organization_id?: string
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          retry_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "synced_emails_email_sync_config_id_fkey"
            columns: ["email_sync_config_id"]
            isOneToOne: false
            referencedRelation: "email_sync_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synced_emails_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "synced_emails_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_bounds: {
        Row: {
          cplh_critical_tolerance: number
          cplh_max: number
          cplh_min: number
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          is_active: boolean
          labor_pct_absolute_escalation: number
          labor_pct_max: number
          labor_pct_min: number
          labor_pct_tolerance_max: number
          labor_pct_tolerance_min: number
          splh_critical_multiplier: number
          splh_max: number
          splh_min: number
          structural_critical_7d: number
          structural_exceptions_14d: number
          structural_exceptions_7d: number
          superseded_by_version: number | null
          updated_at: string
          version: number
        }
        Insert: {
          cplh_critical_tolerance?: number
          cplh_max?: number
          cplh_min?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          is_active?: boolean
          labor_pct_absolute_escalation?: number
          labor_pct_max?: number
          labor_pct_min?: number
          labor_pct_tolerance_max?: number
          labor_pct_tolerance_min?: number
          splh_critical_multiplier?: number
          splh_max?: number
          splh_min?: number
          structural_critical_7d?: number
          structural_exceptions_14d?: number
          structural_exceptions_7d?: number
          superseded_by_version?: number | null
          updated_at?: string
          version: number
        }
        Update: {
          cplh_critical_tolerance?: number
          cplh_max?: number
          cplh_min?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          is_active?: boolean
          labor_pct_absolute_escalation?: number
          labor_pct_max?: number
          labor_pct_min?: number
          labor_pct_tolerance_max?: number
          labor_pct_tolerance_min?: number
          splh_critical_multiplier?: number
          splh_max?: number
          splh_min?: number
          structural_critical_7d?: number
          structural_exceptions_14d?: number
          structural_exceptions_7d?: number
          superseded_by_version?: number | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_bounds_superseded_by_version_fkey"
            columns: ["superseded_by_version"]
            isOneToOne: false
            referencedRelation: "system_bounds"
            referencedColumns: ["version"]
          },
        ]
      }
      system_bounds_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changes: Json | null
          id: string
          impact_note: string | null
          version: number
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json | null
          id?: string
          impact_note?: string | null
          version: number
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changes?: Json | null
          id?: string
          impact_note?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_bounds_audit_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "system_bounds"
            referencedColumns: ["version"]
          },
        ]
      }
      system_metrics: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          metric_date: string
          metric_type: string
          target: number | null
          value: number
          variance: number | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          metric_date: string
          metric_type: string
          target?: number | null
          value: number
          variance?: number | null
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          metric_date?: string
          metric_type?: string
          target?: number | null
          value?: number
          variance?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_metrics_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "system_metrics_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      table_zones: {
        Row: {
          camera_config_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          polygon: Json
          table_name: string
          venue_id: string
          zone_type: string
        }
        Insert: {
          camera_config_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          polygon: Json
          table_name: string
          venue_id: string
          zone_type: string
        }
        Update: {
          camera_config_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          polygon?: Json
          table_name?: string
          venue_id?: string
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_zones_camera_config_id_fkey"
            columns: ["camera_config_id"]
            isOneToOne: false
            referencedRelation: "camera_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_zones_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "table_zones_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          organization_id: string
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          organization_id: string
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_settings: {
        Row: {
          auto_clock_out_before_overtime: boolean | null
          auto_clock_out_hours: number | null
          auto_logout_on_geofence_exit: boolean | null
          created_at: string
          early_clock_in_minutes: number | null
          geofence_check_interval_seconds: number | null
          id: string
          late_clock_out_grace_minutes: number | null
          lockout_duration_minutes: number | null
          max_failed_attempts: number | null
          meal_break_duration_minutes: number | null
          pin_length: number | null
          prevent_overtime_clock_in: boolean | null
          require_meal_break_after_hours: number | null
          require_pin: boolean | null
          require_rest_breaks: boolean | null
          rest_break_duration_minutes: number | null
          updated_at: string
          venue_id: string
          weekly_overtime_threshold: number | null
        }
        Insert: {
          auto_clock_out_before_overtime?: boolean | null
          auto_clock_out_hours?: number | null
          auto_logout_on_geofence_exit?: boolean | null
          created_at?: string
          early_clock_in_minutes?: number | null
          geofence_check_interval_seconds?: number | null
          id?: string
          late_clock_out_grace_minutes?: number | null
          lockout_duration_minutes?: number | null
          max_failed_attempts?: number | null
          meal_break_duration_minutes?: number | null
          pin_length?: number | null
          prevent_overtime_clock_in?: boolean | null
          require_meal_break_after_hours?: number | null
          require_pin?: boolean | null
          require_rest_breaks?: boolean | null
          rest_break_duration_minutes?: number | null
          updated_at?: string
          venue_id: string
          weekly_overtime_threshold?: number | null
        }
        Update: {
          auto_clock_out_before_overtime?: boolean | null
          auto_clock_out_hours?: number | null
          auto_logout_on_geofence_exit?: boolean | null
          created_at?: string
          early_clock_in_minutes?: number | null
          geofence_check_interval_seconds?: number | null
          id?: string
          late_clock_out_grace_minutes?: number | null
          lockout_duration_minutes?: number | null
          max_failed_attempts?: number | null
          meal_break_duration_minutes?: number | null
          pin_length?: number | null
          prevent_overtime_clock_in?: boolean | null
          require_meal_break_after_hours?: number | null
          require_pin?: boolean | null
          require_rest_breaks?: boolean | null
          rest_break_duration_minutes?: number | null
          updated_at?: string
          venue_id?: string
          weekly_overtime_threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "time_clock_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_requests: {
        Row: {
          affected_shifts: Json | null
          created_at: string
          employee_id: string
          end_date: string
          id: string
          is_partial_day: boolean | null
          manager_notes: string | null
          notes: string | null
          partial_hours: number | null
          reason: string | null
          request_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          affected_shifts?: Json | null
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          is_partial_day?: boolean | null
          manager_notes?: string | null
          notes?: string | null
          partial_hours?: number | null
          reason?: string | null
          request_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          affected_shifts?: Json | null
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          is_partial_day?: boolean | null
          manager_notes?: string | null
          notes?: string | null
          partial_hours?: number | null
          reason?: string | null
          request_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "time_off_requests_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      time_punches: {
        Row: {
          auto_logout_reason: string | null
          business_date: string
          created_at: string
          device_id: string | null
          distance_from_venue: number | null
          employee_id: string
          entered_by: string | null
          flag_reason: string | null
          id: string
          ip_address: unknown
          is_auto_logout: boolean | null
          is_flagged: boolean | null
          is_manual_entry: boolean | null
          location_accuracy: number | null
          location_lat: number | null
          location_lng: number | null
          override_reason: string | null
          photo_url: string | null
          prevented_reason: string | null
          punch_time: string
          punch_type: string
          resolved_at: string | null
          resolved_by: string | null
          shift_assignment_id: string | null
          updated_at: string
          user_agent: string | null
          venue_id: string
          within_geofence: boolean | null
        }
        Insert: {
          auto_logout_reason?: string | null
          business_date: string
          created_at?: string
          device_id?: string | null
          distance_from_venue?: number | null
          employee_id: string
          entered_by?: string | null
          flag_reason?: string | null
          id?: string
          ip_address?: unknown
          is_auto_logout?: boolean | null
          is_flagged?: boolean | null
          is_manual_entry?: boolean | null
          location_accuracy?: number | null
          location_lat?: number | null
          location_lng?: number | null
          override_reason?: string | null
          photo_url?: string | null
          prevented_reason?: string | null
          punch_time?: string
          punch_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          shift_assignment_id?: string | null
          updated_at?: string
          user_agent?: string | null
          venue_id: string
          within_geofence?: boolean | null
        }
        Update: {
          auto_logout_reason?: string | null
          business_date?: string
          created_at?: string
          device_id?: string | null
          distance_from_venue?: number | null
          employee_id?: string
          entered_by?: string | null
          flag_reason?: string | null
          id?: string
          ip_address?: unknown
          is_auto_logout?: boolean | null
          is_flagged?: boolean | null
          is_manual_entry?: boolean | null
          location_accuracy?: number | null
          location_lat?: number | null
          location_lng?: number | null
          override_reason?: string | null
          photo_url?: string | null
          prevented_reason?: string | null
          punch_time?: string
          punch_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          shift_assignment_id?: string | null
          updated_at?: string
          user_agent?: string | null
          venue_id?: string
          within_geofence?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "time_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_punches_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_punches_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_punches_shift_assignment_id_fkey"
            columns: ["shift_assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_punches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "time_punches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          break_hours: number | null
          business_date: string
          clock_in: string | null
          clock_out: string | null
          created_at: string
          edit_reason: string | null
          edited_at: string | null
          edited_by: string | null
          employee_id: string
          id: string
          overtime_hours: number | null
          regular_hours: number | null
          shift_assignment_id: string | null
          status: string
          total_hours: number | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          break_hours?: number | null
          business_date: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_id: string
          id?: string
          overtime_hours?: number | null
          regular_hours?: number | null
          shift_assignment_id?: string | null
          status?: string
          total_hours?: number | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          break_hours?: number | null
          business_date?: string
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          employee_id?: string
          id?: string
          overtime_hours?: number | null
          regular_hours?: number | null
          shift_assignment_id?: string | null
          status?: string
          total_hours?: number | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_shift_assignment_id_fkey"
            columns: ["shift_assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "timesheets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tipsee_nightly_cache: {
        Row: {
          business_date: string
          location_name: string
          location_uuid: string
          query_duration_ms: number | null
          report_data: Json
          synced_at: string
          venue_id: string
        }
        Insert: {
          business_date: string
          location_name: string
          location_uuid: string
          query_duration_ms?: number | null
          report_data: Json
          synced_at?: string
          venue_id: string
        }
        Update: {
          business_date?: string
          location_name?: string
          location_uuid?: string
          query_duration_ms?: number | null
          report_data?: Json
          synced_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipsee_nightly_cache_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "tipsee_nightly_cache_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tipsee_sync_log: {
        Row: {
          completed_at: string | null
          cron_job_id: string | null
          error_message: string | null
          id: string
          started_at: string
          status: string
          sync_date: string
          total_duration_ms: number | null
          triggered_by: string | null
          venues_failed: number | null
          venues_synced: number | null
        }
        Insert: {
          completed_at?: string | null
          cron_job_id?: string | null
          error_message?: string | null
          id?: string
          started_at?: string
          status: string
          sync_date: string
          total_duration_ms?: number | null
          triggered_by?: string | null
          venues_failed?: number | null
          venues_synced?: number | null
        }
        Update: {
          completed_at?: string | null
          cron_job_id?: string | null
          error_message?: string | null
          id?: string
          started_at?: string
          status?: string
          sync_date?: string
          total_duration_ms?: number | null
          triggered_by?: string | null
          venues_failed?: number | null
          venues_synced?: number | null
        }
        Relationships: []
      }
      unmapped_items: {
        Row: {
          created_at: string | null
          id: string
          last_seen_invoice_id: string | null
          last_unit_cost: number | null
          mapped_to_item_id: string | null
          notes: string | null
          occurrence_count: number | null
          pack_size: string | null
          raw_description: string
          status: string | null
          unit_of_measure: string | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_seen_invoice_id?: string | null
          last_unit_cost?: number | null
          mapped_to_item_id?: string | null
          notes?: string | null
          occurrence_count?: number | null
          pack_size?: string | null
          raw_description: string
          status?: string | null
          unit_of_measure?: string | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_seen_invoice_id?: string | null
          last_unit_cost?: number | null
          mapped_to_item_id?: string | null
          notes?: string | null
          occurrence_count?: number | null
          pack_size?: string | null
          raw_description?: string
          status?: string | null
          unit_of_measure?: string | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unmapped_items_last_seen_invoice_id_fkey"
            columns: ["last_seen_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmapped_items_mapped_to_item_id_fkey"
            columns: ["mapped_to_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmapped_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          password_hash: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          password_hash: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          password_hash?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendor_ach_forms: {
        Row: {
          authorized_by: string | null
          created_at: string | null
          form_type: string
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signature_data: string | null
          signature_date: string | null
          status: string | null
          updated_at: string | null
          vendor_id: string
          vendor_profile_id: string | null
        }
        Insert: {
          authorized_by?: string | null
          created_at?: string | null
          form_type: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signature_data?: string | null
          signature_date?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_id: string
          vendor_profile_id?: string | null
        }
        Update: {
          authorized_by?: string | null
          created_at?: string | null
          form_type?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signature_data?: string | null
          signature_date?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_id?: string
          vendor_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_ach_forms_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ach_forms_vendor_profile_id_fkey"
            columns: ["vendor_profile_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_item_aliases: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          item_id: string
          last_unit_cost: number | null
          pack_size: string | null
          updated_at: string | null
          vendor_description: string | null
          vendor_id: string
          vendor_item_code: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          item_id: string
          last_unit_cost?: number | null
          pack_size?: string | null
          updated_at?: string | null
          vendor_description?: string | null
          vendor_id: string
          vendor_item_code: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          item_id?: string
          last_unit_cost?: number | null
          pack_size?: string | null
          updated_at?: string | null
          vendor_description?: string | null
          vendor_id?: string
          vendor_item_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_item_aliases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_item_aliases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_items: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          item_id: string
          last_order_date: string | null
          last_price: number | null
          lead_time_days: number | null
          moq: number | null
          pack_size: string | null
          tier_price: number
          tier_qty: number
          updated_at: string | null
          vendor_description: string | null
          vendor_id: string
          vendor_item_code: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          item_id: string
          last_order_date?: string | null
          last_price?: number | null
          lead_time_days?: number | null
          moq?: number | null
          pack_size?: string | null
          tier_price: number
          tier_qty?: number
          updated_at?: string | null
          vendor_description?: string | null
          vendor_id: string
          vendor_item_code?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          item_id?: string
          last_order_date?: string | null
          last_price?: number | null
          lead_time_days?: number | null
          moq?: number | null
          pack_size?: string | null
          tier_price?: number
          tier_qty?: number
          updated_at?: string | null
          vendor_description?: string | null
          vendor_id?: string
          vendor_item_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_onboarding_invitations: {
        Row: {
          created_at: string | null
          created_by: string | null
          email_sent_to: string | null
          expires_at: string | null
          id: string
          status: string | null
          submitted_at: string | null
          token: string
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email_sent_to?: string | null
          expires_at?: string | null
          id?: string
          status?: string | null
          submitted_at?: string | null
          token: string
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email_sent_to?: string | null
          expires_at?: string | null
          id?: string
          status?: string | null
          submitted_at?: string | null
          token?: string
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_onboarding_invitations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_profiles: {
        Row: {
          account_number_last4: string | null
          account_type: string | null
          address_line1: string | null
          address_line2: string | null
          bank_address_line1: string | null
          bank_address_line2: string | null
          bank_city: string | null
          bank_name: string | null
          bank_routing_number: string | null
          bank_state: string | null
          bank_zip_code: string | null
          city: string | null
          company_name: string | null
          contact_person_first_name: string | null
          contact_person_last_name: string | null
          country: string | null
          created_at: string | null
          entity_type: string | null
          id: string
          legal_name: string | null
          name_on_account: string | null
          profile_complete: boolean | null
          remittance_email: string | null
          state: string | null
          updated_at: string | null
          vendor_id: string
          voided_check_url: string | null
          w9_form_url: string | null
          zip_code: string | null
        }
        Insert: {
          account_number_last4?: string | null
          account_type?: string | null
          address_line1?: string | null
          address_line2?: string | null
          bank_address_line1?: string | null
          bank_address_line2?: string | null
          bank_city?: string | null
          bank_name?: string | null
          bank_routing_number?: string | null
          bank_state?: string | null
          bank_zip_code?: string | null
          city?: string | null
          company_name?: string | null
          contact_person_first_name?: string | null
          contact_person_last_name?: string | null
          country?: string | null
          created_at?: string | null
          entity_type?: string | null
          id?: string
          legal_name?: string | null
          name_on_account?: string | null
          profile_complete?: boolean | null
          remittance_email?: string | null
          state?: string | null
          updated_at?: string | null
          vendor_id: string
          voided_check_url?: string | null
          w9_form_url?: string | null
          zip_code?: string | null
        }
        Update: {
          account_number_last4?: string | null
          account_type?: string | null
          address_line1?: string | null
          address_line2?: string | null
          bank_address_line1?: string | null
          bank_address_line2?: string | null
          bank_city?: string | null
          bank_name?: string | null
          bank_routing_number?: string | null
          bank_state?: string | null
          bank_zip_code?: string | null
          city?: string | null
          company_name?: string | null
          contact_person_first_name?: string | null
          contact_person_last_name?: string | null
          country?: string | null
          created_at?: string | null
          entity_type?: string | null
          id?: string
          legal_name?: string | null
          name_on_account?: string | null
          profile_complete?: boolean | null
          remittance_email?: string | null
          state?: string | null
          updated_at?: string | null
          vendor_id?: string
          voided_check_url?: string | null
          w9_form_url?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_profiles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_statement_lines: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          invoice_number: string | null
          line_date: string
          line_number: number | null
          match_confidence: number | null
          match_method: string | null
          matched: boolean
          matched_po_id: string | null
          notes: string | null
          reference_number: string | null
          requires_review: boolean
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          variance_amount: number | null
          variance_reason: string | null
          vendor_statement_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_number?: string | null
          line_date: string
          line_number?: number | null
          match_confidence?: number | null
          match_method?: string | null
          matched?: boolean
          matched_po_id?: string | null
          notes?: string | null
          reference_number?: string | null
          requires_review?: boolean
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          variance_amount?: number | null
          variance_reason?: string | null
          vendor_statement_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_number?: string | null
          line_date?: string
          line_number?: number | null
          match_confidence?: number | null
          match_method?: string | null
          matched?: boolean
          matched_po_id?: string | null
          notes?: string | null
          reference_number?: string | null
          requires_review?: boolean
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          variance_amount?: number | null
          variance_reason?: string | null
          vendor_statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_statement_lines_matched_po_id_fkey"
            columns: ["matched_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_statement_lines_matched_po_id_fkey"
            columns: ["matched_po_id"]
            isOneToOne: false
            referencedRelation: "three_way_match"
            referencedColumns: ["po_id"]
          },
          {
            foreignKeyName: "vendor_statement_lines_vendor_statement_id_fkey"
            columns: ["vendor_statement_id"]
            isOneToOne: false
            referencedRelation: "vendor_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_statements: {
        Row: {
          created_at: string
          id: string
          imported_at: string
          imported_by: string | null
          notes: string | null
          reconciled: boolean
          reconciled_at: string | null
          reconciled_by: string | null
          statement_number: string | null
          statement_pdf_url: string | null
          statement_period_end: string
          statement_period_start: string
          statement_total: number
          updated_at: string
          vendor_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          notes?: string | null
          reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
          statement_number?: string | null
          statement_pdf_url?: string | null
          statement_period_end: string
          statement_period_start: string
          statement_total: number
          updated_at?: string
          vendor_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          notes?: string | null
          reconciled?: boolean
          reconciled_at?: string | null
          reconciled_by?: string | null
          statement_number?: string | null
          statement_pdf_url?: string | null
          statement_period_end?: string
          statement_period_start?: string
          statement_total?: number
          updated_at?: string
          vendor_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_statements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_statements_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "vendor_statements_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_tolerances: {
        Row: {
          auto_approve_threshold_pct: number | null
          created_at: string | null
          critical_items: Json | null
          id: string
          matching_mode: string | null
          price_tolerance_pct: number | null
          qty_tolerance_pct: number | null
          require_po_number: boolean | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          auto_approve_threshold_pct?: number | null
          created_at?: string | null
          critical_items?: Json | null
          id?: string
          matching_mode?: string | null
          price_tolerance_pct?: number | null
          qty_tolerance_pct?: number | null
          require_po_number?: boolean | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          auto_approve_threshold_pct?: number | null
          created_at?: string | null
          critical_items?: Json | null
          id?: string
          matching_mode?: string | null
          price_tolerance_pct?: number | null
          qty_tolerance_pct?: number | null
          require_po_number?: boolean | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_tolerances_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_users: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_users_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          normalized_name: string
          organization_id: string
          payment_terms_days: number | null
          r365_vendor_id: string | null
          updated_at: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          normalized_name: string
          organization_id: string
          payment_terms_days?: number | null
          r365_vendor_id?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          normalized_name?: string
          organization_id?: string
          payment_terms_days?: number | null
          r365_vendor_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_day_facts: {
        Row: {
          avg_check: number | null
          avg_cover: number | null
          beer_sales: number | null
          beverage_pct: number | null
          beverage_sales: number | null
          business_date: string
          checks_count: number
          comps_total: number | null
          covers_count: number
          created_at: string | null
          discounts_total: number | null
          etl_run_id: string | null
          food_sales: number | null
          gross_sales: number
          has_variance: boolean | null
          id: string
          is_complete: boolean | null
          items_sold: number | null
          last_synced_at: string
          liquor_sales: number | null
          net_sales: number
          other_sales: number | null
          refunds_total: number | null
          service_charges_total: number | null
          taxes_total: number | null
          tips_total: number | null
          updated_at: string | null
          variance_amount: number | null
          venue_id: string
          voids_total: number | null
          wine_sales: number | null
        }
        Insert: {
          avg_check?: number | null
          avg_cover?: number | null
          beer_sales?: number | null
          beverage_pct?: number | null
          beverage_sales?: number | null
          business_date: string
          checks_count?: number
          comps_total?: number | null
          covers_count?: number
          created_at?: string | null
          discounts_total?: number | null
          etl_run_id?: string | null
          food_sales?: number | null
          gross_sales?: number
          has_variance?: boolean | null
          id?: string
          is_complete?: boolean | null
          items_sold?: number | null
          last_synced_at?: string
          liquor_sales?: number | null
          net_sales?: number
          other_sales?: number | null
          refunds_total?: number | null
          service_charges_total?: number | null
          taxes_total?: number | null
          tips_total?: number | null
          updated_at?: string | null
          variance_amount?: number | null
          venue_id: string
          voids_total?: number | null
          wine_sales?: number | null
        }
        Update: {
          avg_check?: number | null
          avg_cover?: number | null
          beer_sales?: number | null
          beverage_pct?: number | null
          beverage_sales?: number | null
          business_date?: string
          checks_count?: number
          comps_total?: number | null
          covers_count?: number
          created_at?: string | null
          discounts_total?: number | null
          etl_run_id?: string | null
          food_sales?: number | null
          gross_sales?: number
          has_variance?: boolean | null
          id?: string
          is_complete?: boolean | null
          items_sold?: number | null
          last_synced_at?: string
          liquor_sales?: number | null
          net_sales?: number
          other_sales?: number | null
          refunds_total?: number | null
          service_charges_total?: number | null
          taxes_total?: number | null
          tips_total?: number | null
          updated_at?: string | null
          variance_amount?: number | null
          venue_id?: string
          voids_total?: number | null
          wine_sales?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_day_facts_etl_run_id_fkey"
            columns: ["etl_run_id"]
            isOneToOne: false
            referencedRelation: "etl_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_day_facts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_geofences: {
        Row: {
          allow_early_clock_in_minutes: number | null
          allow_late_clock_out_minutes: number | null
          center_lat: number
          center_lng: number
          created_at: string
          id: string
          is_active: boolean | null
          radius_meters: number
          require_geofence: boolean | null
          require_photo: boolean | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          allow_early_clock_in_minutes?: number | null
          allow_late_clock_out_minutes?: number | null
          center_lat: number
          center_lng: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          radius_meters?: number
          require_geofence?: boolean | null
          require_photo?: boolean | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          allow_early_clock_in_minutes?: number | null
          allow_late_clock_out_minutes?: number | null
          center_lat?: number
          center_lng?: number
          created_at?: string
          id?: string
          is_active?: boolean | null
          radius_meters?: number
          require_geofence?: boolean | null
          require_photo?: boolean | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_geofences_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_geofences_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_health_actions: {
        Row: {
          action_detail: string | null
          action_type: string
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          date: string
          health_score: number
          id: string
          status: string
          venue_id: string
        }
        Insert: {
          action_detail?: string | null
          action_type: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          date: string
          health_score: number
          id?: string
          status: string
          venue_id: string
        }
        Update: {
          action_detail?: string | null
          action_type?: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          date?: string
          health_score?: number
          id?: string
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_health_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_health_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_health_daily: {
        Row: {
          computed_at: string | null
          confidence: number
          date: string
          health_score: number
          id: string
          signal_count: number
          status: string
          top_drivers: Json | null
          venue_id: string
        }
        Insert: {
          computed_at?: string | null
          confidence?: number
          date: string
          health_score: number
          id?: string
          signal_count?: number
          status: string
          top_drivers?: Json | null
          venue_id: string
        }
        Update: {
          computed_at?: string | null
          confidence?: number
          date?: string
          health_score?: number
          id?: string
          signal_count?: number
          status?: string
          top_drivers?: Json | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_health_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_health_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_health_signals_daily: {
        Row: {
          computed_at: string | null
          confidence: number
          date: string
          id: string
          raw_inputs: Json | null
          reason: string | null
          risk: number
          signal: string
          venue_id: string
        }
        Insert: {
          computed_at?: string | null
          confidence?: number
          date: string
          id?: string
          raw_inputs?: Json | null
          reason?: string | null
          risk: number
          signal: string
          venue_id: string
        }
        Update: {
          computed_at?: string | null
          confidence?: number
          date?: string
          id?: string
          raw_inputs?: Json | null
          reason?: string | null
          risk?: number
          signal?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_health_signals_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_health_signals_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_health_thresholds: {
        Row: {
          color: string | null
          id: string
          max_score: number
          min_score: number
          status: string
        }
        Insert: {
          color?: string | null
          id?: string
          max_score: number
          min_score: number
          status: string
        }
        Update: {
          color?: string | null
          id?: string
          max_score?: number
          min_score?: number
          status?: string
        }
        Relationships: []
      }
      venue_health_trigger_rules: {
        Row: {
          action_detail: string
          action_type: string
          assign_to_role: string | null
          created_at: string | null
          deadline_hours: number | null
          enabled: boolean | null
          id: string
          status: string
          trigger_signal: string | null
        }
        Insert: {
          action_detail: string
          action_type: string
          assign_to_role?: string | null
          created_at?: string | null
          deadline_hours?: number | null
          enabled?: boolean | null
          id?: string
          status: string
          trigger_signal?: string | null
        }
        Update: {
          action_detail?: string
          action_type?: string
          assign_to_role?: string | null
          created_at?: string | null
          deadline_hours?: number | null
          enabled?: boolean | null
          id?: string
          status?: string
          trigger_signal?: string | null
        }
        Relationships: []
      }
      venue_health_weights: {
        Row: {
          enabled: boolean | null
          id: string
          signal: string
          updated_at: string | null
          venue_class: string
          weight: number
        }
        Insert: {
          enabled?: boolean | null
          id?: string
          signal: string
          updated_at?: string | null
          venue_class?: string
          weight: number
        }
        Update: {
          enabled?: boolean | null
          id?: string
          signal?: string
          updated_at?: string | null
          venue_class?: string
          weight?: number
        }
        Relationships: []
      }
      venue_review_signals_daily: {
        Row: {
          avg_rating: number | null
          computed_at: string
          date: string
          id: string
          neg_count: number
          review_count: number
          source_mix: Json
          tag_mix: Json
          venue_id: string
        }
        Insert: {
          avg_rating?: number | null
          computed_at?: string
          date: string
          id?: string
          neg_count?: number
          review_count?: number
          source_mix?: Json
          tag_mix?: Json
          venue_id: string
        }
        Update: {
          avg_rating?: number | null
          computed_at?: string
          date?: string
          id?: string
          neg_count?: number
          review_count?: number
          source_mix?: Json
          tag_mix?: Json
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_review_signals_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_review_signals_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_tipsee_mapping: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          tipsee_location_name: string | null
          tipsee_location_uuid: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          tipsee_location_name?: string | null
          tipsee_location_uuid: string
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          tipsee_location_name?: string | null
          tipsee_location_uuid?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_tipsee_mapping_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_tipsee_mapping_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          labor_rate_per_hour: number | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          organization_id: string | null
          phone: string | null
          pos_type: Database["public"]["Enums"]["pos_type"]
          r365_entity_id: string | null
          state: string | null
          timezone: string | null
          updated_at: string | null
          venue_class: Database["public"]["Enums"]["venue_class"] | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          labor_rate_per_hour?: number | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          organization_id?: string | null
          phone?: string | null
          pos_type: Database["public"]["Enums"]["pos_type"]
          r365_entity_id?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string | null
          venue_class?: Database["public"]["Enums"]["venue_class"] | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          labor_rate_per_hour?: number | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          organization_id?: string | null
          phone?: string | null
          pos_type?: Database["public"]["Enums"]["pos_type"]
          r365_entity_id?: string | null
          state?: string | null
          timezone?: string | null
          updated_at?: string | null
          venue_class?: Database["public"]["Enums"]["venue_class"] | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_schedules: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_generated: boolean | null
          created_at: string
          generated_at: string | null
          generated_by: string | null
          id: string
          labor_percentage: number | null
          margin_improvement_estimate: number | null
          optimization_mode: string | null
          overall_cplh: number | null
          projected_revenue: number | null
          published_at: string | null
          requires_approval: boolean | null
          service_quality_score: number | null
          status: string
          target_labor_percentage: number | null
          total_labor_cost: number | null
          total_labor_hours: number | null
          updated_at: string
          venue_id: string
          week_end_date: string
          week_start_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_generated?: boolean | null
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          labor_percentage?: number | null
          margin_improvement_estimate?: number | null
          optimization_mode?: string | null
          overall_cplh?: number | null
          projected_revenue?: number | null
          published_at?: string | null
          requires_approval?: boolean | null
          service_quality_score?: number | null
          status?: string
          target_labor_percentage?: number | null
          total_labor_cost?: number | null
          total_labor_hours?: number | null
          updated_at?: string
          venue_id: string
          week_end_date: string
          week_start_date: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_generated?: boolean | null
          created_at?: string
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          labor_percentage?: number | null
          margin_improvement_estimate?: number | null
          optimization_mode?: string | null
          overall_cplh?: number | null
          projected_revenue?: number | null
          published_at?: string | null
          requires_approval?: boolean | null
          service_quality_score?: number | null
          status?: string
          target_labor_percentage?: number | null
          total_labor_cost?: number | null
          total_labor_hours?: number | null
          updated_at?: string
          venue_id?: string
          week_end_date?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_schedules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "weekly_schedules_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      zone_events: {
        Row: {
          camera_config_id: string
          confidence: number | null
          created_at: string
          detected_at: string
          event_type: string
          id: string
          person_count: number
          raw_detection: Json | null
          snapshot_hash: string | null
          table_zone_id: string
          venue_id: string
        }
        Insert: {
          camera_config_id: string
          confidence?: number | null
          created_at?: string
          detected_at: string
          event_type: string
          id?: string
          person_count?: number
          raw_detection?: Json | null
          snapshot_hash?: string | null
          table_zone_id: string
          venue_id: string
        }
        Update: {
          camera_config_id?: string
          confidence?: number | null
          created_at?: string
          detected_at?: string
          event_type?: string
          id?: string
          person_count?: number
          raw_detection?: Json | null
          snapshot_hash?: string | null
          table_zone_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zone_events_camera_config_id_fkey"
            columns: ["camera_config_id"]
            isOneToOne: false
            referencedRelation: "camera_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zone_events_table_zone_id_fkey"
            columns: ["table_zone_id"]
            isOneToOne: false
            referencedRelation: "table_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zone_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "zone_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_manager_actions: {
        Row: {
          action: string | null
          assigned_role: string | null
          assigned_to: string | null
          business_date: string | null
          category: string | null
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          created_at: string | null
          description: string | null
          escalated_at: string | null
          escalated_to: string | null
          escalation_reason: string | null
          expires_at: string | null
          id: string | null
          metadata: Json | null
          priority: string | null
          related_checks: Json | null
          related_employees: Json | null
          source_report: string | null
          source_type: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          venue_id: string | null
        }
        Insert: {
          action?: string | null
          assigned_role?: string | null
          assigned_to?: string | null
          business_date?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description?: string | null
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          expires_at?: string | null
          id?: string | null
          metadata?: Json | null
          priority?: string | null
          related_checks?: Json | null
          related_employees?: Json | null
          source_report?: string | null
          source_type?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Update: {
          action?: string | null
          assigned_role?: string | null
          assigned_to?: string | null
          business_date?: string | null
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string | null
          description?: string | null
          escalated_at?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          expires_at?: string | null
          id?: string | null
          metadata?: Json | null
          priority?: string | null
          related_checks?: Json | null
          related_employees?: Json | null
          source_report?: string | null
          source_type?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "manager_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      attestation_follow_ups: {
        Row: {
          attestation_id: string | null
          business_date: string | null
          category: string | null
          created_at: string | null
          item_id: string | null
          item_type: string | null
          notes: string | null
          subject: string | null
          venue_id: string | null
        }
        Relationships: []
      }
      automation_cron_jobs: {
        Row: {
          active: boolean | null
          command: string | null
          jobid: number | null
          jobname: string | null
          schedule: string | null
        }
        Insert: {
          active?: boolean | null
          command?: string | null
          jobid?: number | null
          jobname?: string | null
          schedule?: string | null
        }
        Update: {
          active?: boolean | null
          command?: string | null
          jobid?: number | null
          jobname?: string | null
          schedule?: string | null
        }
        Relationships: []
      }
      cplh_by_position_shift: {
        Row: {
          avg_check: number | null
          avg_complaints: number | null
          avg_covers_per_employee: number | null
          business_date: string | null
          covers_per_labor_hour: number | null
          day_of_week: number | null
          employee_count: number | null
          last_updated: string | null
          position_category: string | null
          position_id: string | null
          position_name: string | null
          records_with_actual_data: number | null
          shift_count: number | null
          shift_type: string | null
          total_covers: number | null
          total_labor_cost: number | null
          total_labor_hours: number | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "shift_assignments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      current_user_venue_ids: {
        Row: {
          venue_id: string | null
        }
        Relationships: []
      }
      forecasts_with_bias: {
        Row: {
          accuracy_sample_size: number | null
          bias_corrected: boolean | null
          bias_reason: string | null
          business_date: string | null
          confidence_pct: number | null
          covers_lower: number | null
          covers_predicted: number | null
          covers_raw: number | null
          covers_upper: number | null
          day_type: Database["public"]["Enums"]["day_type"] | null
          day_type_offset: number | null
          historical_mape: number | null
          holiday_adjustment: number | null
          holiday_code: Database["public"]["Enums"]["holiday_code"] | null
          holiday_offset: number | null
          id: string | null
          model_version: string | null
          on_hand_resos: number | null
          pacing_multiplier: number | null
          revenue_predicted: number | null
          revenue_raw: number | null
          shift_type: string | null
          typical_resos: number | null
          venue_class: Database["public"]["Enums"]["venue_class"] | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_forecasts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "demand_forecasts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_suggestion_accuracy: {
        Row: {
          acceptance_rate_pct: number | null
          accepted_count: number | null
          item_category: string | null
          organization_id: string | null
          suggestion_confidence: string | null
          total_suggestions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gl_mapping_feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      override_analytics: {
        Row: {
          avg_delta: number | null
          avg_value_add: number | null
          override_count: number | null
          reason_code: Database["public"]["Enums"]["override_reason"] | null
          times_improved: number | null
          times_neutral: number | null
          times_worsened: number | null
          venue_id: string | null
          venue_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecast_overrides_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "forecast_overrides_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_attestations: {
        Row: {
          amended_at: string | null
          amended_by: string | null
          amendment_reason: string | null
          business_date: string | null
          coaching_count: number | null
          comp_resolution_count: number | null
          created_at: string | null
          id: string | null
          incident_count: number | null
          labor_confirmed: boolean | null
          labor_notes: string | null
          labor_variance_reason: string | null
          locked_at: string | null
          locked_by: string | null
          revenue_confirmed: boolean | null
          revenue_notes: string | null
          revenue_variance_reason: string | null
          status: string | null
          submitted_at: string | null
          submitted_by: string | null
          triggers_snapshot: Json | null
          updated_at: string | null
          venue_id: string | null
          venue_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nightly_attestations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "nightly_attestations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_labor_concept_aggregates: {
        Row: {
          blended_rate: number | null
          category: string | null
          concept_type: string | null
          total_hours_per_100: number | null
        }
        Relationships: []
      }
      proforma_labor_position_mix: {
        Row: {
          applies_to: string[] | null
          category: string | null
          category_total_hours_per_100: number | null
          concept_type: string | null
          cover_threshold: number | null
          hourly_rate: number | null
          hours_per_100_covers: number | null
          hours_per_shift: number | null
          labor_driver_type: string | null
          position_mix_pct: number | null
          position_name: string | null
          staff_per_service: number | null
        }
        Relationships: []
      }
      proforma_monthly_covers: {
        Row: {
          bar_guests: number | null
          dining_covers: number | null
          month_num: number | null
          pdr_covers: number | null
          scenario_id: string | null
          total_covers: number | null
        }
        Relationships: []
      }
      proforma_monthly_labor_cost: {
        Row: {
          additional_salary_monthly: number | null
          agm_salary_monthly: number | null
          boh_hours: number | null
          boh_wages: number | null
          foh_hours: number | null
          foh_wages: number | null
          gm_salary_monthly: number | null
          gross_wages: number | null
          km_salary_monthly: number | null
          month_num: number | null
          payroll_burden: number | null
          scenario_id: string | null
          total_covers: number | null
          total_hourly_wages: number | null
          total_hours: number | null
          total_labor_cost: number | null
          total_salary_monthly: number | null
        }
        Relationships: []
      }
      proforma_monthly_labor_hours: {
        Row: {
          boh_hours: number | null
          boh_hours_per_100_covers: number | null
          foh_hours: number | null
          foh_hours_per_100_covers: number | null
          month_num: number | null
          scenario_id: string | null
          total_covers: number | null
          total_hours: number | null
        }
        Relationships: []
      }
      proforma_monthly_position_hours: {
        Row: {
          applies_to: string[] | null
          category: string | null
          category_total_hours: number | null
          concept_type: string | null
          cover_threshold: number | null
          hourly_rate: number | null
          hours_per_shift: number | null
          implied_shifts: number | null
          labor_driver_type: string | null
          month_num: number | null
          position_hours: number | null
          position_labor_cost: number | null
          position_mix_pct: number | null
          position_name: string | null
          scenario_id: string | null
          staff_per_service: number | null
          total_covers: number | null
        }
        Relationships: []
      }
      proforma_settings_summary: {
        Row: {
          avg_days_per_month: number | null
          bar_inches_per_seat: number | null
          bar_lf_ratio: number | null
          bar_lounge_dining_area_pct_max: number | null
          bar_lounge_dining_area_pct_min: number | null
          bar_lounge_sf_per_seat_max: number | null
          bar_lounge_sf_per_seat_min: number | null
          bar_max_lf: number | null
          bar_max_pct_of_dining: number | null
          bar_min_lf: number | null
          casual_dining_dining_area_pct_max: number | null
          casual_dining_dining_area_pct_min: number | null
          casual_dining_sf_per_seat_max: number | null
          casual_dining_sf_per_seat_min: number | null
          created_at: string | null
          days_per_year: number | null
          default_avg_dining_time_hours: number | null
          default_bar_active_pct: number | null
          default_bar_avg_spend_per_guest: number | null
          default_bar_bev_pct: number | null
          default_bar_dwell_hours: number | null
          default_bar_food_pct: number | null
          default_bar_net_to_gross: number | null
          default_bar_rail_ft_per_guest: number | null
          default_bar_utilization_pct: number | null
          default_bar_zone_pct: number | null
          default_bev_cogs_pct: number | null
          default_bev_mix_pct: number | null
          default_boh_hourly_rate: number | null
          default_boh_hours_per_100_covers: number | null
          default_boh_pct: number | null
          default_cc_fees_pct: number | null
          default_cleaning_pct: number | null
          default_code_sf_per_person: number | null
          default_concept_archetype: string | null
          default_density_benchmark: string | null
          default_dining_area_pct: number | null
          default_dow_friday_pct: number | null
          default_dow_monday_pct: number | null
          default_dow_saturday_pct: number | null
          default_dow_sunday_pct: number | null
          default_dow_thursday_pct: number | null
          default_dow_tuesday_pct: number | null
          default_dow_wednesday_pct: number | null
          default_foh_hourly_rate: number | null
          default_foh_hours_per_100_covers: number | null
          default_food_cogs_pct: number | null
          default_food_mix_pct: number | null
          default_gna_pct: number | null
          default_linen_pct: number | null
          default_marketing_pct: number | null
          default_other_cogs_pct: number | null
          default_other_mix_pct: number | null
          default_payroll_burden_pct: number | null
          default_pdr_avg_party_size: number | null
          default_pdr_avg_spend_per_person: number | null
          default_pdr_bev_pct: number | null
          default_pdr_capacity: number | null
          default_pdr_events_per_month: number | null
          default_pdr_food_pct: number | null
          default_pdr_other_pct: number | null
          default_pdr_ramp_months: number | null
          default_ramp_curve: string | null
          default_ramp_months: number | null
          default_ramp_start_pct: number | null
          default_realization_rate: number | null
          default_service_days_per_week: number | null
          default_service_hours: number | null
          default_services_per_day: number | null
          default_sf_per_seat: number | null
          default_sf_per_standing_guest: number | null
          default_smallwares_pct: number | null
          default_standable_pct: number | null
          default_utilization_factor: number | null
          default_utilization_pct: number | null
          fast_casual_dining_area_pct_max: number | null
          fast_casual_dining_area_pct_min: number | null
          fast_casual_sf_per_seat_max: number | null
          fast_casual_sf_per_seat_min: number | null
          fine_dining_dining_area_pct_max: number | null
          fine_dining_dining_area_pct_min: number | null
          fine_dining_sf_per_seat_max: number | null
          fine_dining_sf_per_seat_min: number | null
          max_rent_per_seat_warning: number | null
          min_boh_pct: number | null
          nightclub_dining_area_pct_max: number | null
          nightclub_dining_area_pct_min: number | null
          nightclub_sf_per_seat_max: number | null
          nightclub_sf_per_seat_min: number | null
          org_id: string | null
          premium_casual_dining_area_pct_max: number | null
          premium_casual_dining_area_pct_min: number | null
          premium_casual_sf_per_seat_max: number | null
          premium_casual_sf_per_seat_min: number | null
          updated_at: string | null
          weeks_per_year: number | null
        }
        Insert: {
          avg_days_per_month?: number | null
          bar_inches_per_seat?: number | null
          bar_lf_ratio?: number | null
          bar_lounge_dining_area_pct_max?: number | null
          bar_lounge_dining_area_pct_min?: number | null
          bar_lounge_sf_per_seat_max?: number | null
          bar_lounge_sf_per_seat_min?: number | null
          bar_max_lf?: number | null
          bar_max_pct_of_dining?: number | null
          bar_min_lf?: number | null
          casual_dining_dining_area_pct_max?: number | null
          casual_dining_dining_area_pct_min?: number | null
          casual_dining_sf_per_seat_max?: number | null
          casual_dining_sf_per_seat_min?: number | null
          created_at?: string | null
          days_per_year?: number | null
          default_avg_dining_time_hours?: number | null
          default_bar_active_pct?: number | null
          default_bar_avg_spend_per_guest?: number | null
          default_bar_bev_pct?: number | null
          default_bar_dwell_hours?: number | null
          default_bar_food_pct?: number | null
          default_bar_net_to_gross?: number | null
          default_bar_rail_ft_per_guest?: number | null
          default_bar_utilization_pct?: number | null
          default_bar_zone_pct?: number | null
          default_bev_cogs_pct?: number | null
          default_bev_mix_pct?: number | null
          default_boh_hourly_rate?: number | null
          default_boh_hours_per_100_covers?: number | null
          default_boh_pct?: number | null
          default_cc_fees_pct?: number | null
          default_cleaning_pct?: number | null
          default_code_sf_per_person?: number | null
          default_concept_archetype?: string | null
          default_density_benchmark?: string | null
          default_dining_area_pct?: number | null
          default_dow_friday_pct?: number | null
          default_dow_monday_pct?: number | null
          default_dow_saturday_pct?: number | null
          default_dow_sunday_pct?: number | null
          default_dow_thursday_pct?: number | null
          default_dow_tuesday_pct?: number | null
          default_dow_wednesday_pct?: number | null
          default_foh_hourly_rate?: number | null
          default_foh_hours_per_100_covers?: number | null
          default_food_cogs_pct?: number | null
          default_food_mix_pct?: number | null
          default_gna_pct?: number | null
          default_linen_pct?: number | null
          default_marketing_pct?: number | null
          default_other_cogs_pct?: number | null
          default_other_mix_pct?: number | null
          default_payroll_burden_pct?: number | null
          default_pdr_avg_party_size?: number | null
          default_pdr_avg_spend_per_person?: number | null
          default_pdr_bev_pct?: number | null
          default_pdr_capacity?: number | null
          default_pdr_events_per_month?: number | null
          default_pdr_food_pct?: number | null
          default_pdr_other_pct?: number | null
          default_pdr_ramp_months?: number | null
          default_ramp_curve?: string | null
          default_ramp_months?: number | null
          default_ramp_start_pct?: number | null
          default_realization_rate?: number | null
          default_service_days_per_week?: number | null
          default_service_hours?: number | null
          default_services_per_day?: number | null
          default_sf_per_seat?: number | null
          default_sf_per_standing_guest?: number | null
          default_smallwares_pct?: number | null
          default_standable_pct?: number | null
          default_utilization_factor?: number | null
          default_utilization_pct?: number | null
          fast_casual_dining_area_pct_max?: number | null
          fast_casual_dining_area_pct_min?: number | null
          fast_casual_sf_per_seat_max?: number | null
          fast_casual_sf_per_seat_min?: number | null
          fine_dining_dining_area_pct_max?: number | null
          fine_dining_dining_area_pct_min?: number | null
          fine_dining_sf_per_seat_max?: number | null
          fine_dining_sf_per_seat_min?: number | null
          max_rent_per_seat_warning?: number | null
          min_boh_pct?: number | null
          nightclub_dining_area_pct_max?: number | null
          nightclub_dining_area_pct_min?: number | null
          nightclub_sf_per_seat_max?: number | null
          nightclub_sf_per_seat_min?: number | null
          org_id?: string | null
          premium_casual_dining_area_pct_max?: number | null
          premium_casual_dining_area_pct_min?: number | null
          premium_casual_sf_per_seat_max?: number | null
          premium_casual_sf_per_seat_min?: number | null
          updated_at?: string | null
          weeks_per_year?: number | null
        }
        Update: {
          avg_days_per_month?: number | null
          bar_inches_per_seat?: number | null
          bar_lf_ratio?: number | null
          bar_lounge_dining_area_pct_max?: number | null
          bar_lounge_dining_area_pct_min?: number | null
          bar_lounge_sf_per_seat_max?: number | null
          bar_lounge_sf_per_seat_min?: number | null
          bar_max_lf?: number | null
          bar_max_pct_of_dining?: number | null
          bar_min_lf?: number | null
          casual_dining_dining_area_pct_max?: number | null
          casual_dining_dining_area_pct_min?: number | null
          casual_dining_sf_per_seat_max?: number | null
          casual_dining_sf_per_seat_min?: number | null
          created_at?: string | null
          days_per_year?: number | null
          default_avg_dining_time_hours?: number | null
          default_bar_active_pct?: number | null
          default_bar_avg_spend_per_guest?: number | null
          default_bar_bev_pct?: number | null
          default_bar_dwell_hours?: number | null
          default_bar_food_pct?: number | null
          default_bar_net_to_gross?: number | null
          default_bar_rail_ft_per_guest?: number | null
          default_bar_utilization_pct?: number | null
          default_bar_zone_pct?: number | null
          default_bev_cogs_pct?: number | null
          default_bev_mix_pct?: number | null
          default_boh_hourly_rate?: number | null
          default_boh_hours_per_100_covers?: number | null
          default_boh_pct?: number | null
          default_cc_fees_pct?: number | null
          default_cleaning_pct?: number | null
          default_code_sf_per_person?: number | null
          default_concept_archetype?: string | null
          default_density_benchmark?: string | null
          default_dining_area_pct?: number | null
          default_dow_friday_pct?: number | null
          default_dow_monday_pct?: number | null
          default_dow_saturday_pct?: number | null
          default_dow_sunday_pct?: number | null
          default_dow_thursday_pct?: number | null
          default_dow_tuesday_pct?: number | null
          default_dow_wednesday_pct?: number | null
          default_foh_hourly_rate?: number | null
          default_foh_hours_per_100_covers?: number | null
          default_food_cogs_pct?: number | null
          default_food_mix_pct?: number | null
          default_gna_pct?: number | null
          default_linen_pct?: number | null
          default_marketing_pct?: number | null
          default_other_cogs_pct?: number | null
          default_other_mix_pct?: number | null
          default_payroll_burden_pct?: number | null
          default_pdr_avg_party_size?: number | null
          default_pdr_avg_spend_per_person?: number | null
          default_pdr_bev_pct?: number | null
          default_pdr_capacity?: number | null
          default_pdr_events_per_month?: number | null
          default_pdr_food_pct?: number | null
          default_pdr_other_pct?: number | null
          default_pdr_ramp_months?: number | null
          default_ramp_curve?: string | null
          default_ramp_months?: number | null
          default_ramp_start_pct?: number | null
          default_realization_rate?: number | null
          default_service_days_per_week?: number | null
          default_service_hours?: number | null
          default_services_per_day?: number | null
          default_sf_per_seat?: number | null
          default_sf_per_standing_guest?: number | null
          default_smallwares_pct?: number | null
          default_standable_pct?: number | null
          default_utilization_factor?: number | null
          default_utilization_pct?: number | null
          fast_casual_dining_area_pct_max?: number | null
          fast_casual_dining_area_pct_min?: number | null
          fast_casual_sf_per_seat_max?: number | null
          fast_casual_sf_per_seat_min?: number | null
          fine_dining_dining_area_pct_max?: number | null
          fine_dining_dining_area_pct_min?: number | null
          fine_dining_sf_per_seat_max?: number | null
          fine_dining_sf_per_seat_min?: number | null
          max_rent_per_seat_warning?: number | null
          min_boh_pct?: number | null
          nightclub_dining_area_pct_max?: number | null
          nightclub_dining_area_pct_min?: number | null
          nightclub_sf_per_seat_max?: number | null
          nightclub_sf_per_seat_min?: number | null
          org_id?: string | null
          premium_casual_dining_area_pct_max?: number | null
          premium_casual_dining_area_pct_min?: number | null
          premium_casual_sf_per_seat_max?: number | null
          premium_casual_sf_per_seat_min?: number | null
          updated_at?: string | null
          weeks_per_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proforma_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_standing_capacity_summary: {
        Row: {
          bar_net_to_gross: number | null
          bar_zone_gross_sf: number | null
          bar_zone_net_sf: number | null
          bar_zone_pct: number | null
          circulation_risk: boolean | null
          code_cap_binding: boolean | null
          code_capacity_cap: number | null
          code_sf_per_person: number | null
          concept_archetype: string | null
          effective_standing_guests: number | null
          multiplier_guests_per_sf: number | null
          project_id: string | null
          project_name: string | null
          raw_standing_guests: number | null
          sf_per_standing_guest: number | null
          standable_pct: number | null
          standable_sf: number | null
          standing_capacity_final: number | null
          standing_capacity_operational: number | null
          total_sf: number | null
          utilization_factor: number | null
          vibe_mismatch: boolean | null
        }
        Insert: {
          bar_net_to_gross?: number | null
          bar_zone_gross_sf?: number | null
          bar_zone_net_sf?: number | null
          bar_zone_pct?: number | null
          circulation_risk?: never
          code_cap_binding?: never
          code_capacity_cap?: number | null
          code_sf_per_person?: number | null
          concept_archetype?: string | null
          effective_standing_guests?: number | null
          multiplier_guests_per_sf?: never
          project_id?: string | null
          project_name?: string | null
          raw_standing_guests?: number | null
          sf_per_standing_guest?: number | null
          standable_pct?: number | null
          standable_sf?: number | null
          standing_capacity_final?: number | null
          standing_capacity_operational?: number | null
          total_sf?: number | null
          utilization_factor?: number | null
          vibe_mismatch?: never
        }
        Update: {
          bar_net_to_gross?: number | null
          bar_zone_gross_sf?: number | null
          bar_zone_net_sf?: number | null
          bar_zone_pct?: number | null
          circulation_risk?: never
          code_cap_binding?: never
          code_capacity_cap?: number | null
          code_sf_per_person?: number | null
          concept_archetype?: string | null
          effective_standing_guests?: number | null
          multiplier_guests_per_sf?: never
          project_id?: string | null
          project_name?: string | null
          raw_standing_guests?: number | null
          sf_per_standing_guest?: number | null
          standable_pct?: number | null
          standable_sf?: number | null
          standing_capacity_final?: number | null
          standing_capacity_operational?: number | null
          total_sf?: number | null
          utilization_factor?: number | null
          vibe_mismatch?: never
        }
        Relationships: []
      }
      service_quality_metrics: {
        Row: {
          avg_check: number | null
          boh_count: number | null
          business_date: string | null
          busser_count: number | null
          busser_to_server_ratio: number | null
          covers_per_server: number | null
          last_updated: string | null
          runner_count: number | null
          server_count: number | null
          shift_type: string | null
          total_covers: number | null
          total_labor_cost: number | null
          total_labor_hours: number | null
          total_staff_count: number | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "shift_assignments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      three_way_match: {
        Row: {
          abs_variance: number | null
          created_at: string | null
          description: string | null
          invoice_amount: number | null
          invoice_number: string | null
          line_date: string | null
          match_confidence: number | null
          match_method: string | null
          match_status: string | null
          matched: boolean | null
          order_date: string | null
          po_id: string | null
          po_number: string | null
          po_status: Database["public"]["Enums"]["order_status"] | null
          po_total: number | null
          receipt_id: string | null
          receipt_total: number | null
          received_at: string | null
          requires_review: boolean | null
          reviewed: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
          statement_line_id: string | null
          variance: number | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_statement_id: string | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_statement_lines_vendor_statement_id_fkey"
            columns: ["vendor_statement_id"]
            isOneToOne: false
            referencedRelation: "vendor_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_statements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_statements_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "vendor_statements_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      v_category_performance: {
        Row: {
          actual_cost: number | null
          actual_cost_pct: number | null
          category: string | null
          date: string | null
          target_cost_pct: number | null
          theoretical_cost: number | null
          theoretical_cost_pct: number | null
          total_sales: number | null
          venue_id: string | null
        }
        Relationships: []
      }
      v_cost_spikes: {
        Row: {
          current_cost: number | null
          effective_date: string | null
          item_id: string | null
          name: string | null
          pct_change: number | null
          prev_cost: number | null
          sku: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_cost_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      v_current_inventory: {
        Row: {
          category: string | null
          id: string | null
          item_id: string | null
          item_name: string | null
          last_cost: number | null
          last_received_at: string | null
          last_updated_at: string | null
          quantity_on_hand: number | null
          sku: string | null
          total_value: number | null
          unit_of_measure: string | null
          venue_id: string | null
          venue_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "inventory_balances_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      v_declining_budget: {
        Row: {
          budget_id: string | null
          cumulative_spend: number | null
          day_offset: number | null
          department_id: string | null
          initial_budget: number | null
          period_start: string | null
          remaining_budget: number | null
          txn_date: string | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "budgets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      v_food_cost_variance: {
        Row: {
          actual_cost: number | null
          actual_food_cost_pct: number | null
          date: string | null
          theoretical_cost: number | null
          theoretical_food_cost_pct: number | null
          total_sales: number | null
          variance_dollars: number | null
          variance_pct: number | null
          venue_id: string | null
        }
        Relationships: []
      }
      v_food_cost_variance_by_category: {
        Row: {
          actual_cost: number | null
          actual_food_cost_pct: number | null
          category: string | null
          date: string | null
          theoretical_cost: number | null
          theoretical_food_cost_pct: number | null
          total_sales: number | null
          variance_dollars: number | null
          variance_pct: number | null
          venue_id: string | null
        }
        Relationships: []
      }
      v_health_actions_open: {
        Row: {
          action_detail: string | null
          action_type: string | null
          created_at: string | null
          date: string | null
          health_score: number | null
          hours_open: number | null
          status: string | null
          venue_id: string | null
          venue_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_health_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_health_actions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inventory_variance: {
        Row: {
          actual_usage: number | null
          beginning_inventory: number | null
          ending_inventory: number | null
          period_end: string | null
          period_start: string | null
          purchases: number | null
          theoretical_usage: number | null
          variance_dollars: number | null
          variance_pct: number | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_period_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "inventory_period_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      v_item_latest_cost: {
        Row: {
          effective_date: string | null
          item_id: string | null
          source: string | null
          unit_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_cost_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      v_product_weights_status: {
        Row: {
          abv_percent: number | null
          brand: string | null
          category: string | null
          created_at: string | null
          empty_g: number | null
          empty_g_source: string | null
          empty_g_source_ref: string | null
          full_g: number | null
          full_g_source: string | null
          full_g_source_ref: string | null
          has_full_weight: boolean | null
          item_name: string | null
          product_name: string | null
          reading_count: number | null
          size_ml: number | null
          sku_id: string | null
          status: string | null
          upc_ean: string | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_weights_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      v_recipe_cost_rollup: {
        Row: {
          cost_per_unit: number | null
          labor_minutes: number | null
          prep_loss_pct: number | null
          raw_cost: number | null
          recipe_id: string | null
          recipe_name: string | null
          total_cost: number | null
          yield_qty: number | null
          yield_uom: string | null
        }
        Relationships: []
      }
      v_recipe_costs: {
        Row: {
          item_id: string | null
          item_name: string | null
          line_cost: number | null
          recipe_id: string | null
          sku: string | null
          total_qty: number | null
          unit_cost: number | null
          uom: string | null
        }
        Relationships: []
      }
      v_theoretical_usage: {
        Row: {
          food_cost_pct: number | null
          item_name: string | null
          items_sold: number | null
          net_sales: number | null
          pos_sku: string | null
          recipe_cost: number | null
          recipe_id: string | null
          recipe_name: string | null
          sale_date: string | null
          theoretical_cost: number | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "v_recipe_cost_rollup"
            referencedColumns: ["recipe_id"]
          },
          {
            foreignKeyName: "pos_sales_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "pos_sales_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      v_venue_health_current: {
        Row: {
          confidence: number | null
          date: string | null
          health_score: number | null
          open_actions: number | null
          signal_count: number | null
          status: string | null
          top_drivers: Json | null
          venue_id: string | null
          venue_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_health_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_health_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      v_venue_health_trend_7d: {
        Row: {
          date: string | null
          health_score: number | null
          rolling_7d_avg: number | null
          status: string | null
          venue_id: string | null
          venue_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_health_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "current_user_venue_ids"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "venue_health_daily_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_inventory_from_count: {
        Args: {
          p_count_id: string
          p_counted_qty: number
          p_item_id: string
          p_venue_id: string
        }
        Returns: undefined
      }
      auto_categorize_food_item: {
        Args: { p_description: string }
        Returns: string
      }
      auto_clock_out_overtime_shifts: {
        Args: never
        Returns: {
          clocked_out_count: number
        }[]
      }
      auto_match_vendor_statement: {
        Args: { p_statement_id: string }
        Returns: {
          matched_lines: number
          review_required: number
          total_lines: number
          unmatched_lines: number
        }[]
      }
      auto_match_vendor_statement_line: {
        Args: { p_statement_line_id: string }
        Returns: {
          confidence: number
          match_method: string
          matched: boolean
          po_id: string
        }[]
      }
      calculate_distance: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      calculate_pack_conversion_factor: {
        Args: {
          p_base_uom: string
          p_unit_size: number
          p_unit_size_uom: string
          p_units_per_pack: number
        }
        Returns: number
      }
      calculate_position_hourly_rate: {
        Args: {
          p_is_tipped: boolean
          p_market_tier: string
          p_min_wage: number
          p_tenant_id?: string
          p_tip_credit: number
          p_wage_multiplier: number
        }
        Returns: number
      }
      calculate_standing_capacity: {
        Args: {
          p_bar_zone_area_sqft: number
          p_sqft_per_person: number
          p_standing_factor: number
        }
        Returns: number
      }
      calculate_statement_variance: {
        Args: { p_statement_line_id: string }
        Returns: number
      }
      can_clock_in: {
        Args: {
          p_current_time: string
          p_employee_id: string
          p_venue_id: string
        }
        Returns: {
          allowed: boolean
          reason: string
        }[]
      }
      can_submit_attestation: {
        Args: { p_business_date: string; p_org_id: string; p_venue_id: string }
        Returns: boolean
      }
      check_bar_rail_support: {
        Args: {
          p_bar_linear_feet: number
          p_rail_ft_per_guest?: number
          p_standing_capacity: number
        }
        Returns: {
          rail_supported_guests: number
          warning: string
        }[]
      }
      check_break_compliance: {
        Args: { p_employee_id: string; p_shift_hours: number }
        Returns: {
          compliant: boolean
          required_breaks: string[]
        }[]
      }
      clamp01: { Args: { val: number }; Returns: number }
      cleanup_old_idempotency_keys: { Args: never; Returns: undefined }
      compute_all_venue_health: {
        Args: { p_date?: string }
        Returns: {
          result: Json
          venue_id: string
        }[]
      }
      compute_empty_from_full: {
        Args: { abv_percent: number; full_g: number; size_ml: number }
        Returns: number
      }
      compute_leakage_risk: {
        Args: { p_date: string; p_venue_id: string }
        Returns: {
          confidence: number
          raw_inputs: Json
          reason: string
          risk: number
        }[]
      }
      compute_pacing_multiplier: {
        Args: { p_on_hand: number; p_typical: number }
        Returns: number
      }
      compute_review_risk: {
        Args: { p_date: string; p_venue_id: string }
        Returns: {
          confidence: number
          raw_inputs: Json
          reason: string
          risk: number
        }[]
      }
      compute_review_signals: {
        Args: { p_end_date: string; p_start_date: string; p_venue_id: string }
        Returns: undefined
      }
      compute_sales_risk: {
        Args: { p_date: string; p_venue_id: string }
        Returns: {
          confidence: number
          raw_inputs: Json
          reason: string
          risk: number
        }[]
      }
      compute_venue_health: {
        Args: { p_date: string; p_venue_class?: string; p_venue_id: string }
        Returns: Json
      }
      create_invoice_with_lines: {
        Args: { invoice_data: Json; lines_data: Json }
        Returns: string
      }
      cron_etl_sync_today: { Args: never; Returns: undefined }
      cron_review_sync: { Args: never; Returns: undefined }
      decay_bias_offsets: {
        Args: never
        Returns: {
          cycle: number
          decay_rate: number
          offsets_after: Json
          offsets_before: Json
          venue_name: string
        }[]
      }
      enforce_health_actions: {
        Args: { p_date: string; p_venue_id: string }
        Returns: number
      }
      etl_backfill: {
        Args: { end_date: string; p_venue_id?: string; start_date: string }
        Returns: undefined
      }
      generate_date_series: {
        Args: { end_date: string; start_date: string }
        Returns: {
          date: string
        }[]
      }
      generate_employee_pin: {
        Args: { p_employee_id: string; p_venue_id: string }
        Returns: string
      }
      generate_onboarding_token: { Args: never; Returns: string }
      get_active_comp_settings: {
        Args: { p_org_id: string }
        Returns: {
          ai_max_tokens: number
          ai_model: string
          ai_temperature: number
          approved_reasons: Json
          daily_comp_pct_critical: number
          daily_comp_pct_warning: number
          high_comp_pct_threshold: number
          high_value_comp_threshold: number
          manager_min_for_high_value: number
          manager_roles: Json
          org_id: string
          server_max_comp_amount: number
          version: number
        }[]
      }
      get_active_operational_standards: {
        Args: { p_org_id: string }
        Returns: {
          comp_ai_max_tokens: number
          comp_ai_model: string
          comp_ai_temperature: number
          comp_approved_reasons: Json
          comp_daily_pct_critical: number
          comp_daily_pct_warning: number
          comp_high_pct_threshold: number
          comp_high_value_threshold: number
          comp_manager_min_high_value: number
          comp_manager_roles: string[]
          comp_server_max_amount: number
          effective_from: string
          effective_to: string
          labor_cplh_target: number
          labor_cplh_tolerance: number
          labor_excluded_roles: string[]
          labor_ot_critical_threshold: number
          labor_ot_warning_threshold: number
          labor_pct_tolerance: number
          labor_splh_floor: number
          labor_target_pct: number
          org_id: string
          version: number
        }[]
      }
      get_active_standard: {
        Args: {
          p_date?: string
          p_domain: Database["public"]["Enums"]["feedback_domain"]
          p_org_id: string
          p_standard_key: string
          p_venue_id: string
        }
        Returns: Json
      }
      get_active_system_bounds: {
        Args: never
        Returns: {
          cplh_critical_tolerance: number
          cplh_max: number
          cplh_min: number
          effective_from: string
          effective_to: string
          labor_pct_absolute_escalation: number
          labor_pct_max: number
          labor_pct_min: number
          labor_pct_tolerance_max: number
          labor_pct_tolerance_min: number
          splh_critical_multiplier: number
          splh_max: number
          splh_min: number
          structural_critical_7d: number
          structural_exceptions_14d: number
          structural_exceptions_7d: number
          version: number
        }[]
      }
      get_auth_uid_by_email: { Args: { lookup_email: string }; Returns: string }
      get_auth_user_id_by_email: {
        Args: { user_email: string }
        Returns: string
      }
      get_cached_nightly_report: {
        Args: { p_business_date: string; p_venue_id: string }
        Returns: Json
      }
      get_comp_settings_at: {
        Args: { p_as_of?: string; p_org_id: string }
        Returns: {
          ai_max_tokens: number
          ai_model: string
          ai_temperature: number
          approved_reasons: Json
          daily_comp_pct_critical: number
          daily_comp_pct_warning: number
          effective_from: string
          effective_to: string
          high_comp_pct_threshold: number
          high_value_comp_threshold: number
          manager_min_for_high_value: number
          manager_roles: Json
          org_id: string
          server_max_comp_amount: number
          version: number
        }[]
      }
      get_concept_benchmarks_at: {
        Args: {
          p_as_of?: string
          p_concept_type: string
          p_market_tier?: string
          p_tenant_id?: string
        }
        Returns: {
          dining_area_pct_max: number
          dining_area_pct_min: number
          effective_date: string
          guest_facing_pct_max: number
          guest_facing_pct_min: number
          is_global: boolean
          kitchen_boh_pct_max: number
          kitchen_boh_pct_min: number
          seats_per_1k_sf_max: number
          seats_per_1k_sf_min: number
          sf_per_seat_max: number
          sf_per_seat_min: number
          storage_office_pct_max: number
          storage_office_pct_min: number
          version: number
        }[]
      }
      get_day_type: {
        Args: { d: string }
        Returns: Database["public"]["Enums"]["day_type"]
      }
      get_effective_bar_mode: {
        Args: { p_center_id: string; p_service_id: string }
        Returns: Database["public"]["Enums"]["bar_mode"]
      }
      get_effective_scenario_data: {
        Args: { p_scenario_id: string }
        Returns: Json
      }
      get_feedback_inbox: {
        Args: { p_limit?: number; p_org_id: string; p_venue_id?: string }
        Returns: {
          business_date: string
          domain: Database["public"]["Enums"]["feedback_domain"]
          due_at: string
          id: string
          required_action: Database["public"]["Enums"]["required_action"]
          severity: Database["public"]["Enums"]["feedback_severity"]
          signal_count: number
          status: Database["public"]["Enums"]["feedback_status"]
          title: string
        }[]
      }
      get_job_success_rate: {
        Args: { p_days_back?: number; p_job_name: string }
        Returns: {
          failed_runs: number
          job_name: string
          success_rate: number
          successful_runs: number
          total_runs: number
        }[]
      }
      get_labor_benchmarks: {
        Args: { concept: string }
        Returns: {
          boh_blended_rate: number
          boh_hours_per_100: number
          foh_blended_rate: number
          foh_hours_per_100: number
          labor_pct_max: number
          labor_pct_min: number
        }[]
      }
      get_latest_tipsee_sync: {
        Args: never
        Returns: {
          completed_at: string
          duration_seconds: number
          status: string
          sync_date: string
          venues_failed: number
          venues_synced: number
        }[]
      }
      get_operational_standards_at: {
        Args: { p_as_of: string; p_org_id: string }
        Returns: {
          comp_ai_max_tokens: number
          comp_ai_model: string
          comp_ai_temperature: number
          comp_approved_reasons: Json
          comp_daily_pct_critical: number
          comp_daily_pct_warning: number
          comp_high_pct_threshold: number
          comp_high_value_threshold: number
          comp_manager_min_high_value: number
          comp_manager_roles: string[]
          comp_server_max_amount: number
          effective_from: string
          effective_to: string
          labor_cplh_target: number
          labor_cplh_tolerance: number
          labor_excluded_roles: string[]
          labor_ot_critical_threshold: number
          labor_ot_warning_threshold: number
          labor_pct_tolerance: number
          labor_splh_floor: number
          labor_target_pct: number
          org_id: string
          version: number
        }[]
      }
      get_or_create_dm_channel: {
        Args: { emp1_id: string; emp2_id: string; v_id: string }
        Returns: string
      }
      get_proforma_settings: {
        Args: { p_org_id: string }
        Returns: {
          avg_days_per_month: number
          bar_inches_per_seat: number
          bar_lf_ratio: number
          bar_lounge_dining_area_pct_max: number
          bar_lounge_dining_area_pct_min: number
          bar_lounge_labor_pct_max: number
          bar_lounge_labor_pct_min: number
          bar_lounge_sf_per_seat_max: number
          bar_lounge_sf_per_seat_min: number
          bar_max_lf: number
          bar_max_pct_of_dining: number
          bar_min_lf: number
          bar_tavern_dining_pct_max: number
          bar_tavern_dining_pct_min: number
          bar_tavern_sf_per_seat_max: number
          bar_tavern_sf_per_seat_min: number
          casual_dining_dining_area_pct_max: number
          casual_dining_dining_area_pct_min: number
          casual_dining_dining_pct_max: number
          casual_dining_dining_pct_min: number
          casual_dining_labor_pct_max: number
          casual_dining_labor_pct_min: number
          casual_dining_sf_per_seat_max: number
          casual_dining_sf_per_seat_min: number
          coffee_shop_dining_pct_max: number
          coffee_shop_dining_pct_min: number
          coffee_shop_sf_per_seat_max: number
          coffee_shop_sf_per_seat_min: number
          created_at: string
          created_by: string | null
          days_per_year: number
          default_avg_dining_time_hours: number
          default_bar_active_pct: number
          default_bar_avg_spend_per_guest: number
          default_bar_bev_pct: number
          default_bar_dwell_hours: number
          default_bar_food_pct: number
          default_bar_net_to_gross: number
          default_bar_rail_ft_per_guest: number
          default_bar_utilization_pct: number
          default_bar_zone_pct: number
          default_bev_cogs_pct: number
          default_bev_mix_pct: number
          default_boh_hourly_rate: number
          default_boh_hours_per_100_covers: number
          default_boh_pct: number
          default_cc_fees_pct: number
          default_cleaning_pct: number
          default_code_sf_per_person: number
          default_concept_archetype: string
          default_density_benchmark: string
          default_dining_area_pct: number
          default_dow_friday_pct: number
          default_dow_monday_pct: number
          default_dow_saturday_pct: number
          default_dow_sunday_pct: number
          default_dow_thursday_pct: number
          default_dow_tuesday_pct: number
          default_dow_wednesday_pct: number
          default_foh_hourly_rate: number
          default_foh_hours_per_100_covers: number
          default_food_cogs_pct: number
          default_food_mix_pct: number
          default_gna_pct: number
          default_linen_pct: number
          default_market_tier: string | null
          default_marketing_pct: number
          default_min_wage_city: number | null
          default_other_cogs_pct: number
          default_other_mix_pct: number
          default_payroll_burden_pct: number
          default_pdr_avg_party_size: number
          default_pdr_avg_spend_per_person: number
          default_pdr_bev_pct: number
          default_pdr_capacity: number
          default_pdr_events_per_month: number
          default_pdr_food_pct: number
          default_pdr_other_pct: number
          default_pdr_ramp_months: number
          default_projection_years: number
          default_ramp_curve: string
          default_ramp_months: number
          default_ramp_start_pct: number
          default_realization_rate: number
          default_service_days_per_week: number
          default_service_hours: number
          default_services_per_day: number
          default_sf_per_seat: number
          default_sf_per_standing_guest: number
          default_smallwares_pct: number
          default_standable_pct: number
          default_tip_credit: number | null
          default_utilization_factor: number
          default_utilization_pct: number
          effective_from: string
          effective_to: string | null
          fast_casual_dining_area_pct_max: number
          fast_casual_dining_area_pct_min: number
          fast_casual_dining_pct_max: number
          fast_casual_dining_pct_min: number
          fast_casual_labor_pct_max: number
          fast_casual_labor_pct_min: number
          fast_casual_sf_per_seat_max: number
          fast_casual_sf_per_seat_min: number
          fine_dining_dining_area_pct_max: number
          fine_dining_dining_area_pct_min: number
          fine_dining_dining_pct_max: number
          fine_dining_dining_pct_min: number
          fine_dining_labor_pct_max: number
          fine_dining_labor_pct_min: number
          fine_dining_sf_per_seat_max: number
          fine_dining_sf_per_seat_min: number
          fiscal_calendar_type: string
          fiscal_year_start_date: string | null
          is_active: boolean
          market_tier_high_multiplier: number | null
          market_tier_low_multiplier: number | null
          market_tier_mid_multiplier: number | null
          max_rent_per_seat_warning: number
          min_boh_pct: number
          nightclub_dining_area_pct_max: number
          nightclub_dining_area_pct_min: number
          nightclub_labor_pct_max: number
          nightclub_labor_pct_min: number
          nightclub_sf_per_seat_max: number
          nightclub_sf_per_seat_min: number
          org_id: string
          premium_casual_dining_area_pct_max: number
          premium_casual_dining_area_pct_min: number
          premium_casual_labor_pct_max: number
          premium_casual_labor_pct_min: number
          premium_casual_sf_per_seat_max: number
          premium_casual_sf_per_seat_min: number
          qsr_dining_pct_max: number
          qsr_dining_pct_min: number
          qsr_sf_per_seat_max: number
          qsr_sf_per_seat_min: number
          superseded_by_org_id: string | null
          superseded_by_version: number | null
          tipped_min_wage_floor_pct: number | null
          updated_at: string
          version: number
          weeks_per_year: number
        }
        SetofOptions: {
          from: "*"
          to: "proforma_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_proforma_settings_at: {
        Args: { p_as_of?: string; p_org_id: string }
        Returns: {
          bar_inches_per_seat: number
          bar_lf_ratio: number
          bar_max_lf: number
          bar_max_pct_of_dining: number
          bar_min_lf: number
          default_bev_cogs_pct: number
          default_boh_hourly_rate: number
          default_boh_hours_per_100_covers: number
          default_boh_pct: number
          default_cc_fees_pct: number
          default_cleaning_pct: number
          default_density_benchmark: string
          default_dining_area_pct: number
          default_foh_hourly_rate: number
          default_foh_hours_per_100_covers: number
          default_food_cogs_pct: number
          default_gna_pct: number
          default_linen_pct: number
          default_market_tier: string
          default_marketing_pct: number
          default_min_wage_city: number
          default_other_cogs_pct: number
          default_payroll_burden_pct: number
          default_projection_years: number
          default_sf_per_seat: number
          default_smallwares_pct: number
          default_tip_credit: number
          effective_from: string
          effective_to: string
          market_tier_high_multiplier: number
          market_tier_low_multiplier: number
          market_tier_mid_multiplier: number
          org_id: string
          tipped_min_wage_floor_pct: number
          version: number
        }[]
      }
      get_recent_job_runs: {
        Args: { p_limit?: number; p_venue_id?: string }
        Returns: {
          completed_at: string
          duration_seconds: number
          error: string
          id: string
          job_name: string
          output: Json
          started_at: string
          status: string
          venue_id: string
        }[]
      }
      get_service_quality_standards: {
        Args: {
          p_as_of_date?: string
          p_shift_type?: string
          p_venue_id: string
        }
        Returns: {
          max_covers_per_server: number
          min_busser_to_server_ratio: number
          min_runner_to_server_ratio: number
          min_service_quality_score: number
          quality_priority_weight: number
        }[]
      }
      get_standing_capacity_warnings: {
        Args: { p_project_id: string }
        Returns: {
          message: string
          severity: string
          value: number
          warning_type: string
        }[]
      }
      get_system_bounds_at: {
        Args: { p_as_of: string }
        Returns: {
          cplh_max: number
          cplh_min: number
          labor_pct_max: number
          labor_pct_min: number
          splh_max: number
          splh_min: number
          version: number
        }[]
      }
      get_user_organization: { Args: never; Returns: string }
      get_user_tenant_context: {
        Args: never
        Returns: {
          auth_user_id: string
          is_admin: boolean
          is_manager: boolean
          is_owner: boolean
          organization_id: string
          role: string
        }[]
      }
      get_user_venue_ids: { Args: never; Returns: string[] }
      get_wage_calculation_breakdown: {
        Args: {
          p_is_tipped: boolean
          p_market_tier: string
          p_min_wage: number
          p_tenant_id?: string
          p_tip_credit: number
          p_wage_multiplier: number
        }
        Returns: Json
      }
      invoke_edge_function: {
        Args: { function_name: string }
        Returns: undefined
      }
      is_global_immutable: {
        Args: { p_record_id: string; p_table_name: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_service_hours: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      mark_email_processed: {
        Args: {
          p_error?: string
          p_invoice_id?: string
          p_synced_email_id: string
        }
        Returns: undefined
      }
      mark_messages_read: {
        Args: {
          p_channel_id: string
          p_employee_id: string
          p_until_message_id: string
        }
        Returns: undefined
      }
      raise_cost_spike_alerts: { Args: never; Returns: undefined }
      recalculate_recipe_cost: {
        Args: { p_recipe_id: string }
        Returns: number
      }
      recalculate_recipes_using_item: {
        Args: { p_item_id: string }
        Returns: number
      }
      recompute_attestation_rollups: {
        Args: { p_attestation_id: string }
        Returns: undefined
      }
      record_gl_mapping_decision: {
        Args: {
          p_gl_account_id: string
          p_invoice_id?: string
          p_item_id: string
          p_organization_id: string
          p_suggested_gl_id?: string
          p_suggestion_confidence?: string
          p_suggestion_reason?: string
          p_vendor_id?: string
        }
        Returns: undefined
      }
      record_inventory_usage: {
        Args: {
          p_item_id: string
          p_notes?: string
          p_quantity: number
          p_reference_id: string
          p_reference_type: string
          p_venue_id: string
        }
        Returns: undefined
      }
      refresh_cost_views: { Args: never; Returns: undefined }
      refresh_cplh_by_position_shift: { Args: never; Returns: undefined }
      refresh_cplh_views: { Args: never; Returns: undefined }
      refresh_forecast_accuracy_stats: {
        Args: { p_lookback_days?: number }
        Returns: {
          out_day_type: string
          out_mape: number
          out_sample_n: number
          out_venue_id: string
          out_within_10: number
        }[]
      }
      refresh_labor_optimization_views: { Args: never; Returns: undefined }
      refresh_pacing_baselines: {
        Args: { p_lookback_days?: number }
        Returns: {
          day_type: string
          sample_size: number
          typical_t24: number
          venue_id: string
        }[]
      }
      refresh_service_quality_metrics: { Args: never; Returns: undefined }
      seed_scenario_labor_positions: {
        Args: { p_concept_type: string; p_scenario_id: string }
        Returns: undefined
      }
      spirit_density_g_per_ml: {
        Args: { abv_percent: number }
        Returns: number
      }
      suggest_gl_account_for_item: {
        Args: {
          p_category: Database["public"]["Enums"]["item_category"]
          p_org_id: string
          p_subcategory: string
        }
        Returns: string
      }
      suggest_gl_account_for_item_v2: {
        Args: {
          p_item_id: string
          p_organization_id: string
          p_vendor_id?: string
        }
        Returns: {
          confidence: string
          external_code: string
          id: string
          name: string
          reason: string
          section: string
        }[]
      }
      trigger_etl_sync: { Args: { p_action?: string }; Returns: undefined }
      user_has_permission: { Args: { required_role: string }; Returns: boolean }
    }
    Enums: {
      alert_type:
        | "cost_spike"
        | "margin_below_floor"
        | "margin_above_ceiling"
        | "missing_mapping"
        | "variance_high"
      approval_status: "pending" | "approved" | "rejected"
      bar_mode: "seated" | "standing" | "none"
      count_status: "open" | "finalized"
      day_of_week: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
      day_type: "weekday" | "friday" | "saturday" | "sunday" | "holiday"
      daypart_type: "brunch" | "lunch" | "dinner" | "late_night" | "all_day"
      department_type: "kitchen" | "bar" | "packaging"
      entertainment_type: "Band" | "Dancers" | "DJ" | "AV"
      etl_status: "running" | "success" | "failed" | "partial"
      feedback_domain:
        | "revenue"
        | "labor"
        | "procurement"
        | "service"
        | "compliance"
      feedback_severity: "info" | "warning" | "critical"
      feedback_status:
        | "open"
        | "acknowledged"
        | "in_progress"
        | "resolved"
        | "suppressed"
        | "escalated"
        | "expired"
      holiday_code:
        | "NYE"
        | "NYD"
        | "BLACK_FRIDAY"
        | "THANKSGIVING"
        | "CHRISTMAS"
        | "JULY_4TH"
        | "LABOR_DAY"
        | "MEMORIAL_DAY"
        | "MLK_DAY"
        | "PRESIDENTS_DAY"
        | "VALENTINES"
      invoice_status: "draft" | "pending_approval" | "approved" | "exported"
      item_category:
        | "food"
        | "beverage"
        | "packaging"
        | "supplies"
        | "liquor"
        | "wine"
        | "beer"
        | "spirits"
        | "non_alcoholic_beverage"
        | "produce"
        | "meat"
        | "seafood"
        | "dairy"
        | "dry_goods"
        | "frozen"
        | "disposables"
        | "chemicals"
        | "smallwares"
        | "other"
      match_confidence: "high" | "medium" | "low" | "unmapped"
      music_type: "playlist" | "dj" | "live" | "other" | "none"
      order_status: "draft" | "pending" | "ordered" | "received" | "cancelled"
      override_reason:
        | "PRIVATE_EVENT"
        | "PROMO_MARKETING"
        | "WEATHER"
        | "VIP_GROUP"
        | "BUYOUT"
        | "LOCAL_EVENT"
        | "HOLIDAY_BEHAVIOR"
        | "MANAGER_GUT"
        | "OTHER"
      owner_role:
        | "venue_manager"
        | "gm"
        | "agm"
        | "corporate"
        | "purchasing"
        | "system"
      pos_type: "toast" | "square"
      receipt_status: "auto_generated" | "manual" | "partial" | "complete"
      recipe_type: "prepared_item" | "menu_item"
      required_action: "acknowledge" | "explain" | "correct" | "resolve"
      signal_source: "rule" | "model" | "ai"
      variance_severity: "none" | "minor" | "warning" | "critical"
      venue_class:
        | "high_end_social"
        | "nightclub"
        | "member_club"
        | "supper_club"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_type: [
        "cost_spike",
        "margin_below_floor",
        "margin_above_ceiling",
        "missing_mapping",
        "variance_high",
      ],
      approval_status: ["pending", "approved", "rejected"],
      bar_mode: ["seated", "standing", "none"],
      count_status: ["open", "finalized"],
      day_of_week: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      day_type: ["weekday", "friday", "saturday", "sunday", "holiday"],
      daypart_type: ["brunch", "lunch", "dinner", "late_night", "all_day"],
      department_type: ["kitchen", "bar", "packaging"],
      entertainment_type: ["Band", "Dancers", "DJ", "AV"],
      etl_status: ["running", "success", "failed", "partial"],
      feedback_domain: [
        "revenue",
        "labor",
        "procurement",
        "service",
        "compliance",
      ],
      feedback_severity: ["info", "warning", "critical"],
      feedback_status: [
        "open",
        "acknowledged",
        "in_progress",
        "resolved",
        "suppressed",
        "escalated",
        "expired",
      ],
      holiday_code: [
        "NYE",
        "NYD",
        "BLACK_FRIDAY",
        "THANKSGIVING",
        "CHRISTMAS",
        "JULY_4TH",
        "LABOR_DAY",
        "MEMORIAL_DAY",
        "MLK_DAY",
        "PRESIDENTS_DAY",
        "VALENTINES",
      ],
      invoice_status: ["draft", "pending_approval", "approved", "exported"],
      item_category: [
        "food",
        "beverage",
        "packaging",
        "supplies",
        "liquor",
        "wine",
        "beer",
        "spirits",
        "non_alcoholic_beverage",
        "produce",
        "meat",
        "seafood",
        "dairy",
        "dry_goods",
        "frozen",
        "disposables",
        "chemicals",
        "smallwares",
        "other",
      ],
      match_confidence: ["high", "medium", "low", "unmapped"],
      music_type: ["playlist", "dj", "live", "other", "none"],
      order_status: ["draft", "pending", "ordered", "received", "cancelled"],
      override_reason: [
        "PRIVATE_EVENT",
        "PROMO_MARKETING",
        "WEATHER",
        "VIP_GROUP",
        "BUYOUT",
        "LOCAL_EVENT",
        "HOLIDAY_BEHAVIOR",
        "MANAGER_GUT",
        "OTHER",
      ],
      owner_role: [
        "venue_manager",
        "gm",
        "agm",
        "corporate",
        "purchasing",
        "system",
      ],
      pos_type: ["toast", "square"],
      receipt_status: ["auto_generated", "manual", "partial", "complete"],
      recipe_type: ["prepared_item", "menu_item"],
      required_action: ["acknowledge", "explain", "correct", "resolve"],
      signal_source: ["rule", "model", "ai"],
      variance_severity: ["none", "minor", "warning", "critical"],
      venue_class: [
        "high_end_social",
        "nightclub",
        "member_club",
        "supper_club",
      ],
    },
  },
} as const
