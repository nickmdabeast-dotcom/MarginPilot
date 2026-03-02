// This file mirrors the shape produced by `supabase gen types typescript`.
// Replace with the CLI-generated output once you have a live project.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_id?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          company_id: string;
          full_name: string;
          phone: string;
          email: string | null;
          address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          full_name: string;
          phone: string;
          email?: string | null;
          address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          full_name?: string;
          phone?: string;
          email?: string | null;
          address?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          id: string;
          company_id: string;
          customer_id: string | null;
          source: string;
          service_type: string | null;
          urgency: string;
          status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          customer_id?: string | null;
          source?: string;
          service_type?: string | null;
          urgency?: string;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          customer_id?: string | null;
          source?: string;
          service_type?: string | null;
          urgency?: string;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      technicians: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          truck_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          truck_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          truck_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "technicians_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          id: string;
          company_id: string;
          technician_id: string | null;
          customer_id: string | null;
          job_date: string;
          revenue_estimate: number;
          duration_estimate_hours: number;
          urgency: number;
          status: string;
          earliest_start: string | null;
          latest_end: string | null;
          scheduled_start: string | null;
          scheduled_end: string | null;
          order_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          technician_id?: string | null;
          customer_id?: string | null;
          job_date: string;
          revenue_estimate: number;
          duration_estimate_hours: number;
          urgency: number;
          status?: string;
          earliest_start?: string | null;
          latest_end?: string | null;
          scheduled_start?: string | null;
          scheduled_end?: string | null;
          order_index?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          technician_id?: string | null;
          customer_id?: string | null;
          job_date?: string;
          revenue_estimate?: number;
          duration_estimate_hours?: number;
          urgency?: number;
          status?: string;
          earliest_start?: string | null;
          latest_end?: string | null;
          scheduled_start?: string | null;
          scheduled_end?: string | null;
          order_index?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_technician_id_fkey";
            columns: ["technician_id"];
            isOneToOne: false;
            referencedRelation: "technicians";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      optimization_runs: {
        Row: {
          id: string;
          company_id: string;
          run_date: string;
          total_revenue_before: number;
          total_revenue_after: number;
          dispatch_plan: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          run_date: string;
          total_revenue_before: number;
          total_revenue_after: number;
          dispatch_plan?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          run_date?: string;
          total_revenue_before?: number;
          total_revenue_after?: number;
          dispatch_plan?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "optimization_runs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      ensure_user_profile: {
        Args: {
          p_company_name?: string | null;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
