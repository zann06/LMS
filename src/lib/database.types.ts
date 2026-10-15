export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          student_number: string | null
          avatar_url: string | null
          role: 'teacher' | 'student'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string
          student_number?: string | null
          avatar_url?: string | null
          role?: 'teacher' | 'student'
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          student_number?: string | null
          avatar_url?: string | null
          role?: 'teacher' | 'student'
          updated_at?: string
        }
        Relationships: []
      }
      teacher_accounts: {
        Row: {
          user_id: string
          account_status: 'active' | 'inactive'
          created_at: string
        }
        Insert: {
          user_id: string
          account_status?: 'active' | 'inactive'
          created_at?: string
        }
        Update: {
          account_status?: 'active' | 'inactive'
        }
        Relationships: []
      }
      classes: {
        Row: {
          id: string
          teacher_id: string
          name: string
          academic_year: string
          description: string | null
          is_archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          name: string
          academic_year?: string
          description?: string | null
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          academic_year?: string
          description?: string | null
          is_archived?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      class_members: {
        Row: {
          id: string
          class_id: string
          student_id: string
          membership_status: 'active' | 'inactive'
          joined_at: string
          left_at: string | null
        }
        Insert: {
          id?: string
          class_id: string
          student_id: string
          membership_status?: 'active' | 'inactive'
          joined_at?: string
          left_at?: string | null
        }
        Update: {
          membership_status?: 'active' | 'inactive'
          left_at?: string | null
        }
        Relationships: []
      }
      materials: {
        Row: {
          id: string
          teacher_id: string
          title: string
          description: string | null
          subject: string
          topic: string
          material_type: 'file' | 'text' | 'link'
          file_path: string | null
          external_url: string | null
          text_content: string | null
          visibility_status: 'draft' | 'published' | 'archived'
          created_at: string
          updated_at: string
          references_json: Json
        }
        Insert: {
          id?: string
          teacher_id?: string
          title: string
          description?: string | null
          subject?: string
          topic?: string
          material_type?: 'file' | 'text' | 'link'
          file_path?: string | null
          external_url?: string | null
          text_content?: string | null
          visibility_status?: 'draft' | 'published' | 'archived'
          references_json?: Json
        }
        Update: {
          title?: string
          description?: string | null
          subject?: string
          topic?: string
          material_type?: 'file' | 'text' | 'link'
          file_path?: string | null
          external_url?: string | null
          text_content?: string | null
          visibility_status?: 'draft' | 'published' | 'archived'
          updated_at?: string
          references_json?: Json
        }
        Relationships: []
      }
      class_materials: {
        Row: { class_id: string; material_id: string }
        Insert: { class_id: string; material_id: string }
        Update: never
        Relationships: []
      }
      teaching_modules: {
        Row: {
          id: string
          teacher_id: string
          title: string
          description: string | null
          subject: string
          topic: string
          learning_objectives: string | null
          content: Json | null
          file_path: string | null
          status: 'draft' | 'published' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id?: string
          title: string
          description?: string | null
          subject?: string
          topic?: string
          learning_objectives?: string | null
          content?: Json | null
          file_path?: string | null
          status?: 'draft' | 'published' | 'archived'
        }
        Update: {
          title?: string
          description?: string | null
          subject?: string
          topic?: string
          learning_objectives?: string | null
          content?: Json | null
          file_path?: string | null
          status?: 'draft' | 'published' | 'archived'
          updated_at?: string
        }
        Relationships: []
      }
      class_modules: {
        Row: { class_id: string; module_id: string }
        Insert: { class_id: string; module_id: string }
        Update: never
        Relationships: []
      }
      assignments: {
        Row: {
          id: string
          teacher_id: string
          class_id: string
          title: string
          instructions: string | null
          attachment_path: string | null
          start_at: string | null
          due_at: string | null
          status: 'draft' | 'published' | 'closed' | 'archived'
          created_at: string
          updated_at: string
          max_score: number
          submission_mode: 'text' | 'file' | 'both'
        }
        Insert: {
          id?: string
          teacher_id?: string
          class_id: string
          title: string
          instructions?: string | null
          attachment_path?: string | null
          start_at?: string | null
          due_at?: string | null
          status?: 'draft' | 'published' | 'closed' | 'archived'
          max_score?: number
          submission_mode?: 'text' | 'file' | 'both'
        }
        Update: {
          title?: string
          instructions?: string | null
          attachment_path?: string | null
          start_at?: string | null
          due_at?: string | null
          status?: 'draft' | 'published' | 'closed' | 'archived'
          updated_at?: string
          max_score?: number
          submission_mode?: 'text' | 'file' | 'both'
        }
        Relationships: []
      }
      assignment_submissions: {
        Row: {
          id: string
          assignment_id: string
          student_id: string
          submission_text: string | null
          file_path: string | null
          submitted_at: string
          score: number | null
          feedback: string | null
          graded_by: string | null
          graded_at: string | null
        }
        Insert: {
          id?: string
          assignment_id: string
          student_id?: string
          submission_text?: string | null
          file_path?: string | null
          submitted_at?: string
          score?: number | null
          feedback?: string | null
          graded_by?: string | null
          graded_at?: string | null
        }
        Update: {
          submission_text?: string | null
          file_path?: string | null
          score?: number | null
          feedback?: string | null
          graded_by?: string | null
          graded_at?: string | null
        }
        Relationships: []
      }
      question_banks: {
        Row: {
          id: string
          teacher_id: string
          title: string
          subject: string
          topic: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id?: string
          title: string
          subject?: string
          topic?: string
          description?: string | null
        }
        Update: {
          title?: string
          subject?: string
          topic?: string
          description?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          id: string
          question_bank_id: string
          teacher_id: string
          question_type: 'mcq' | 'essay'
          question_text: string
          options_json: Json | null
          explanation: string | null
          points: number
          difficulty: 'easy' | 'medium' | 'hard' | null
          competency: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          question_bank_id: string
          teacher_id?: string
          question_type: 'mcq' | 'essay'
          question_text: string
          options_json?: Json | null
          explanation?: string | null
          points?: number
          difficulty?: 'easy' | 'medium' | 'hard' | null
          competency?: string | null
        }
        Update: {
          question_text?: string
          options_json?: Json | null
          explanation?: string | null
          points?: number
          difficulty?: 'easy' | 'medium' | 'hard' | null
          competency?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      question_answer_keys: {
        Row: {
          id: string
          question_id: string
          teacher_id: string
          answer_key_json: Json
          rubric_json: Json | null
          explanation: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          question_id: string
          teacher_id: string
          answer_key_json: Json
          rubric_json?: Json | null
          explanation?: string | null
        }
        Update: {
          answer_key_json?: Json
          rubric_json?: Json | null
          explanation?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      exams: {
        Row: {
          id: string
          teacher_id: string
          title: string
          instructions: string | null
          duration_minutes: number
          start_at: string | null
          end_at: string | null
          max_attempts: number
          shuffle_questions: boolean
          shuffle_options: boolean
          show_score_after_submit: boolean
          show_explanations_after_submit: boolean
          status: 'draft' | 'scheduled' | 'published' | 'closed' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id?: string
          title: string
          instructions?: string | null
          duration_minutes?: number
          start_at?: string | null
          end_at?: string | null
          max_attempts?: number
          shuffle_questions?: boolean
          shuffle_options?: boolean
          show_score_after_submit?: boolean
          show_explanations_after_submit?: boolean
          status?: 'draft' | 'scheduled' | 'published' | 'closed' | 'archived'
        }
        Update: {
          title?: string
          instructions?: string | null
          duration_minutes?: number
          start_at?: string | null
          end_at?: string | null
          max_attempts?: number
          shuffle_questions?: boolean
          shuffle_options?: boolean
          show_score_after_submit?: boolean
          show_explanations_after_submit?: boolean
          status?: 'draft' | 'scheduled' | 'published' | 'closed' | 'archived'
          updated_at?: string
        }
        Relationships: []
      }
      exam_classes: {
        Row: { exam_id: string; class_id: string }
        Insert: { exam_id: string; class_id: string }
        Update: never
        Relationships: []
      }
      exam_questions: {
        Row: {
          id: string
          exam_id: string
          question_id: string
          position: number
          points_override: number | null
          question_snapshot: Json
        }
        Insert: {
          id?: string
          exam_id: string
          question_id: string
          position?: number
          points_override?: number | null
          question_snapshot?: Json
        }
        Update: {
          position?: number
          points_override?: number | null
          question_snapshot?: Json
        }
        Relationships: []
      }
      exam_attempts: {
        Row: {
          id: string
          exam_id: string
          student_id: string
          attempt_number: number
          started_at: string
          deadline_at: string | null
          submitted_at: string | null
          status: 'in_progress' | 'submitted' | 'awaiting_grading' | 'graded' | 'invalidated'
          objective_score: number | null
          essay_score: number | null
          total_score: number | null
          graded_at: string | null
        }
        Insert: {
          id?: string
          exam_id: string
          student_id?: string
          attempt_number?: number
          started_at?: string
          deadline_at?: string | null
          submitted_at?: string | null
          status?: 'in_progress' | 'submitted' | 'awaiting_grading' | 'graded' | 'invalidated'
        }
        Update: {
          submitted_at?: string | null
          status?: 'in_progress' | 'submitted' | 'awaiting_grading' | 'graded' | 'invalidated'
          objective_score?: number | null
          essay_score?: number | null
          total_score?: number | null
          graded_at?: string | null
        }
        Relationships: []
      }
      student_answers: {
        Row: {
          id: string
          attempt_id: string
          exam_question_id: string
          answer_json: Json
          is_correct: boolean | null
          awarded_points: number | null
          teacher_feedback: string | null
          graded_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          attempt_id: string
          exam_question_id: string
          answer_json?: Json
          is_correct?: boolean | null
          awarded_points?: number | null
          teacher_feedback?: string | null
          graded_at?: string | null
        }
        Update: {
          answer_json?: Json
          is_correct?: boolean | null
          awarded_points?: number | null
          teacher_feedback?: string | null
          graded_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      grades: {
        Row: {
          id: string
          student_id: string
          class_id: string
          exam_attempt_id: string | null
          assignment_submission_id: string | null
          score: number
          max_score: number
          feedback: string | null
          graded_by: string
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          class_id: string
          exam_attempt_id?: string | null
          assignment_submission_id?: string | null
          score: number
          max_score: number
          feedback?: string | null
          graded_by: string
          published_at?: string | null
        }
        Update: {
          score?: number
          max_score?: number
          feedback?: string | null
          published_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          metadata_json: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          metadata_json?: Json | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      submit_exam_attempt: { Args: { p_attempt_id: string }; Returns: Json }
      add_student_to_class_by_email: { Args: { p_class_id: string; p_email: string }; Returns: Json }
      get_attempt_review: { Args: { p_attempt_id: string }; Returns: Json }
      teacher_close_attempts: { Args: { p_exam_id: string; p_only_expired?: boolean }; Returns: number }
      publish_exam_grades: { Args: { p_exam_id: string; p_publish?: boolean }; Returns: number }
      grade_assignment_submission: { Args: { p_submission_id: string; p_score: number; p_feedback?: string | null }; Returns: Json }
      grade_essay_answer: { Args: { p_answer_id: string; p_points: number; p_feedback?: string | null }; Returns: Json }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
