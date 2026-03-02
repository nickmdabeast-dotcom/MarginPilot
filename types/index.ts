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
          job_date: string;
          revenue_estimate: number;
          duration_estimate_hours: number;
          urgency: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          technician_id?: string | null;
          job_date: string;
          revenue_estimate: number;
          duration_estimate_hours: number;
          urgency: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          technician_id?: string | null;
          job_date?: string;
          revenue_estimate?: number;
          duration_estimate_hours?: number;
          urgency?: number;
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
        ];
      };
      optimization_runs: {
        Row: {
          id: string;
          company_id: string;
          run_date: string;
          total_revenue_before: number;
          total_revenue_after: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          run_date: string;
          total_revenue_before: number;
          total_revenue_after: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          run_date?: string;
          total_revenue_before?: number;
          total_revenue_after?: number;
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
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
