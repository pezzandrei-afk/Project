export type GameStatus = 'UPCOMING' | 'LIVE' | 'FINAL'

export type GameRow = {
  id: string
  event_id: string | null
  queue_order: number | null
  code: string
  home_team: string
  away_team: string
  home_color: string
  away_color: string
  home_logo: string
  away_logo: string
  home_score: number
  away_score: number
  status: GameStatus
  created_at: string
  updated_at: string
}

export type ScoreboardEventRow = {
  id: string
  code: string
  title: string
  owner_id: string
  current_game_id: string | null
  created_at: string
  updated_at: string
}

export type GameEventRow = {
  id: string
  event_order: number
  game_id: string
  event_type: 'START' | 'SCORE' | 'STATUS' | 'RESET' | 'UNDO'
  team: 'home' | 'away' | null
  home_delta: number
  away_delta: number
  undone_at: string | null
  undo_of: string | null
  home_score: number
  away_score: number
  message: string
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      scoreboard_events: {
        Row: ScoreboardEventRow
        Insert: {
          id?: string
          code: string
          title: string
          owner_id?: string
          current_game_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          title?: string
          owner_id?: string
          current_game_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      games: {
        Row: GameRow
        Insert: {
          id?: string
          event_id?: string | null
          queue_order?: number | null
          code: string
          home_team: string
          away_team: string
          home_color?: string
          away_color?: string
          home_logo?: string
          away_logo?: string
          home_score?: number
          away_score?: number
          status?: GameStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string | null
          queue_order?: number | null
          code?: string
          home_team?: string
          away_team?: string
          home_color?: string
          away_color?: string
          home_logo?: string
          away_logo?: string
          home_score?: number
          away_score?: number
          status?: GameStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_events: {
        Row: GameEventRow
        Insert: {
          id?: string
          event_order?: number
          game_id: string
          event_type: string
          team?: 'home' | 'away' | null
          home_delta?: number
          away_delta?: number
          undone_at?: string | null
          undo_of?: string | null
          home_score: number
          away_score: number
          message: string
          created_at?: string
        }
        Update: {
          id?: string
          event_order?: number
          game_id?: string
          event_type?: string
          team?: 'home' | 'away' | null
          home_delta?: number
          away_delta?: number
          undone_at?: string | null
          undo_of?: string | null
          home_score?: number
          away_score?: number
          message?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      create_game: {
        Args: {
          p_code: string
          p_home_team: string
          p_away_team: string
          p_manager_key: string
          p_home_color?: string
          p_away_color?: string
          p_home_logo?: string
          p_away_logo?: string
        }
        Returns: string
      }
      verify_manager_key: {
        Args: {
          p_code: string
          p_manager_key: string
        }
        Returns: boolean
      }
      update_game: {
        Args: {
          p_code: string
          p_manager_key: string
          p_home_delta?: number
          p_away_delta?: number
          p_home_score?: number
          p_away_score?: number
          p_status: GameStatus
        }
        Returns: boolean
      }
      undo_last_score: {
        Args: {
          p_code: string
          p_manager_key: string
        }
        Returns: boolean
      }
      verify_event_game_owner: {
        Args: {
          p_code: string
        }
        Returns: boolean
      }
      update_event_game: {
        Args: {
          p_code: string
          p_home_delta: number
          p_away_delta: number
          p_status: GameStatus
        }
        Returns: boolean
      }
      undo_event_game_score: {
        Args: {
          p_code: string
        }
        Returns: boolean
      }
      reset_event_game_score: {
        Args: {
          p_code: string
        }
        Returns: boolean
      }
      update_event_game_teams: {
        Args: {
          p_code: string
          p_home_team: string
          p_away_team: string
          p_home_color: string
          p_away_color: string
          p_home_logo: string
          p_away_logo: string
        }
        Returns: boolean
      }
      reset_game_score: {
        Args: {
          p_code: string
          p_manager_key: string
        }
        Returns: boolean
      }
      update_game_teams: {
        Args: {
          p_code: string
          p_manager_key: string
          p_home_team: string
          p_away_team: string
          p_home_color: string
          p_away_color: string
          p_home_logo: string
          p_away_logo: string
        }
        Returns: boolean
      }
      create_scoreboard_event: {
        Args: {
          p_code: string
          p_title: string
        }
        Returns: string
      }
      create_event_game: {
        Args: {
          p_event_code: string
          p_code: string
          p_home_team: string
          p_away_team: string
          p_home_color: string
          p_away_color: string
          p_home_logo: string
          p_away_logo: string
        }
        Returns: string
      }
      start_event_game: {
        Args: {
          p_event_code: string
          p_game_id: string
        }
        Returns: boolean
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
