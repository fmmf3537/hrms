-- M0.5-1: 审批流基础设施（3 张表：模板 / 实例 / 节点操作记录）

-- CreateTable
CREATE TABLE "approval_flows" (
    "id" UUID NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "nodes" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_instances" (
    "id" UUID NOT NULL,
    "flow_id" UUID NOT NULL,
    "flow_key" VARCHAR(100) NOT NULL,
    "business_type" VARCHAR(50) NOT NULL,
    "business_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "initiator_id" UUID NOT NULL,
    "current_node_id" VARCHAR(64),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_records" (
    "id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "node_id" VARCHAR(64) NOT NULL,
    "approver_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "from_user_id" UUID,
    "to_user_id" UUID,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_flows_category_key_version_key" ON "approval_flows"("category", "key", "version");

-- CreateIndex
CREATE INDEX "approval_flows_category_key_enabled_idx" ON "approval_flows"("category", "key", "enabled");

-- CreateIndex
CREATE INDEX "approval_flows_enabled_idx" ON "approval_flows"("enabled");

-- CreateIndex
CREATE INDEX "approval_instances_flow_key_idx" ON "approval_instances"("flow_key");

-- CreateIndex
CREATE INDEX "approval_instances_business_type_business_id_idx" ON "approval_instances"("business_type", "business_id");

-- CreateIndex
CREATE INDEX "approval_instances_initiator_id_status_idx" ON "approval_instances"("initiator_id", "status");

-- CreateIndex
CREATE INDEX "approval_instances_status_idx" ON "approval_instances"("status");

-- CreateIndex
CREATE INDEX "approval_instances_current_node_id_idx" ON "approval_instances"("current_node_id");

-- CreateIndex
CREATE INDEX "approval_records_instance_id_idx" ON "approval_records"("instance_id");

-- CreateIndex
CREATE INDEX "approval_records_approver_id_action_idx" ON "approval_records"("approver_id", "action");

-- CreateIndex
CREATE INDEX "approval_records_created_at_idx" ON "approval_records"("created_at");

-- AddForeignKey
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "approval_flows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_records" ADD CONSTRAINT "approval_records_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
