import type { ColumnMetadata } from "../../scripts/legacy-data-migration";

// Frozen from the read-only production inventory on 2026-07-15. This is
// intentionally independent of the target Drizzle schema so target changes
// cannot silently redefine the legacy source fixture.
const LIVE_COLUMN_SNAPSHOT = [
  "admin_policy_acceptance|id:character varying:varchar:NO,admin_id:character varying:varchar:NO,timestamp:timestamp without time zone:timestamp:NO,policy_version:character varying:varchar:NO,terms_version:character varying:varchar:NO,privacy_version:character varying:varchar:NO,accepted:boolean:bool:NO",
  "ai_models|id:character varying:varchar:NO,label:text:text:NO,model_id:text:text:NO,provider:text:text:NO,fireworks_model_id:text:text:YES,enabled:boolean:bool:NO,position:integer:int4:NO,created_at:timestamp without time zone:timestamp:NO",
  "all_skills|id:character varying:varchar:NO,name:text:text:NO,grouping_id:character varying:varchar:YES,embedding:USER-DEFINED:vector:YES,embedding_model:text:text:YES",
  "audit_logs|id:character varying:varchar:NO,user_id:character varying:varchar:NO,action:text:text:NO,payload:jsonb:jsonb:YES,created_at:timestamp without time zone:timestamp:NO",
  "bio|id:character varying:varchar:NO,headline:text:text:YES,created_at:timestamp without time zone:timestamp:NO,updated_at:timestamp without time zone:timestamp:NO",
  "bio_paragraphs|id:character varying:varchar:NO,bio_id:character varying:varchar:NO,content:text:text:NO,position:integer:int4:NO",
  "browser_request_logs|id:character varying:varchar:NO,hashed_uuid:text:text:NO,ip:text:text:YES,method:text:text:NO,path:text:text:NO,status_code:integer:int4:YES,duration_ms:integer:int4:YES,meta:jsonb:jsonb:NO,created_at:timestamp without time zone:timestamp:NO",
  "browser_tracking|id:character varying:varchar:NO,hashed_uuid:text:text:NO,tr_en:text:text:YES,consented_at:timestamp without time zone:timestamp:YES,created_at:timestamp without time zone:timestamp:NO,updated_at:timestamp without time zone:timestamp:NO",
  "browser_tracking_ips|id:character varying:varchar:NO,hashed_uuid:text:text:NO,ip:text:text:NO,first_seen_at:timestamp without time zone:timestamp:NO,last_seen_at:timestamp without time zone:timestamp:NO",
  "education|id:character varying:varchar:NO,school:text:text:NO,location:text:text:NO,degree:text:text:NO,dates:text:text:NO,position:integer:int4:NO,created_at:timestamp without time zone:timestamp:NO,updated_at:timestamp without time zone:timestamp:NO",
  "experiences|id:character varying:varchar:NO,role:text:text:NO,company:text:text:NO,location:text:text:NO,duration:text:text:NO,description:text:text:NO,technologies:ARRAY:_text:NO,is_active:boolean:bool:NO,position:integer:int4:NO,created_at:timestamp without time zone:timestamp:NO,updated_at:timestamp without time zone:timestamp:NO",
  "github_timeline_events|id:character varying:varchar:NO,ext_id:character varying:varchar:NO,type:text:text:NO,title:text:text:NO,description:text:text:YES,url:text:text:YES,repo:text:text:NO,timestamp:timestamp without time zone:timestamp:NO,meta:jsonb:jsonb:NO,created_at:timestamp without time zone:timestamp:NO",
  "ip_rate_logs|id:character varying:varchar:NO,ip:text:text:NO,method:text:text:NO,path:text:text:NO,status_code:integer:int4:YES,tracking_ip_id:character varying:varchar:YES,created_at:timestamp without time zone:timestamp:NO",
  "legal_document_versions|id:character varying:varchar:NO,doc_type:text:text:NO,content:text:text:NO,content_hash:text:text:NO,commit_sha:text:text:NO,committed_at:timestamp with time zone:timestamptz:NO,recorded_at:timestamp with time zone:timestamptz:NO",
  "linkedin_timeline_events|id:character varying:varchar:NO,ext_id:character varying:varchar:NO,type:text:text:NO,title:text:text:NO,description:text:text:YES,url:text:text:YES,source:text:text:NO,timestamp:timestamp without time zone:timestamp:NO,meta:jsonb:jsonb:NO,created_at:timestamp without time zone:timestamp:NO",
  "personal_information|id:character varying:varchar:NO,name:text:text:NO,title:text:text:NO,location:text:text:NO,short_bio:text:text:NO,email:text:text:NO,phone:text:text:NO,phone_formatted:text:text:NO,linkedin_url:text:text:NO,github_url:text:text:NO,devpost_url:text:text:NO,portfolio_url:text:text:NO,updated_at:timestamp without time zone:timestamp:NO",
  "portfolio_skills|id:character varying:varchar:NO,all_skill_id:character varying:varchar:NO,position:integer:int4:NO,deleted_at:timestamp without time zone:timestamp:YES,archived_by:character varying:varchar:YES",
  "projects|id:character varying:varchar:NO,title:text:text:NO,category:text:text:NO,description:text:text:NO,long_description:text:text:YES,tech:ARRAY:_text:NO,image:text:text:YES,hover_image:text:text:YES,deployed_url:text:text:YES,github_url:text:text:YES,position:integer:int4:NO,created_at:timestamp without time zone:timestamp:NO,deleted_at:timestamp without time zone:timestamp:YES,archived_by:character varying:varchar:YES,ai_system_prompt:text:text:YES,updated_at:timestamp without time zone:timestamp:NO",
  "session|sid:character varying:varchar:NO,sess:jsonb:jsonb:NO,expire:timestamp without time zone:timestamp:NO",
  "skills_group|id:character varying:varchar:NO,name:text:text:NO,discipline_id:character varying:varchar:YES,position:integer:int4:NO,created_at:timestamp without time zone:timestamp:NO,updated_at:timestamp without time zone:timestamp:NO",
  "users|id:character varying:varchar:NO,email:text:text:NO,google_sub:text:text:NO,name:text:text:YES,role:text:text:NO,created_at:timestamp without time zone:timestamp:NO",
  "welcome_messages|id:character varying:varchar:NO,slug:text:text:NO,label:text:text:NO,message:text:text:NO,archived_at:timestamp without time zone:timestamp:YES,created_at:timestamp without time zone:timestamp:NO,updated_at:timestamp without time zone:timestamp:NO",
  "xyz_bullets|id:character varying:varchar:NO,project_id:character varying:varchar:NO,bullet_text:text:text:NO,position:integer:int4:NO,created_at:timestamp without time zone:timestamp:NO,updated_at:timestamp without time zone:timestamp:NO",
] as const;

export const LEGACY_PORTFOLIO_COLUMN_SNAPSHOT: readonly ColumnMetadata[] = LIVE_COLUMN_SNAPSHOT.flatMap(
  (tableSnapshot) => {
    const [tableName, columns] = tableSnapshot.split("|");
    if (!tableName || !columns) throw new Error("Invalid frozen legacy Portfolio schema snapshot");
    return columns.split(",").map((columnSnapshot) => {
      const [columnName, dataType, udtName, isNullable] = columnSnapshot.split(":");
      if (!columnName || !dataType || !udtName || (isNullable !== "YES" && isNullable !== "NO")) {
        throw new Error("Invalid frozen legacy Portfolio column snapshot");
      }
      return { tableName, columnName, dataType, udtName, isNullable };
    });
  },
);
