<script setup lang="ts" generic="T extends Record<string, unknown>">
/**
 * 通用数据表格（分页 + 操作列）
 * @props data / columns / total / page / pageSize / loading
 * @emits update:page / update:pageSize / refresh / row-click
 * @slots actions 操作列（row: T）
 */
export interface DataTableColumn<Row extends Record<string, unknown>> {
  prop: keyof Row & string;
  label: string;
  width?: string | number;
  sortable?: boolean;
  formatter?: (row: Row) => string;
}

interface Props {
  data: T[];
  columns: DataTableColumn<T>[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
}

withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<{
  (e: 'update:page', value: number): void;
  (e: 'update:pageSize', value: number): void;
  (e: 'refresh'): void;
  (e: 'row-click', row: T): void;
}>();

function onRowClick(row: T): void {
  emit('row-click', row);
}
</script>

<template>
  <div class="data-table">
    <el-table
      v-loading="loading"
      :data="data"
      stripe
      @row-click="onRowClick"
    >
      <el-table-column
        v-for="col in columns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        :width="col.width"
        :sortable="col.sortable"
      >
        <template v-if="col.formatter" #default="{ row }">
          {{ col.formatter(row as T) }}
        </template>
      </el-table-column>
      <el-table-column v-if="$slots.actions" label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <slot name="actions" :row="(row as T)" />
        </template>
      </el-table-column>
    </el-table>
    <div class="data-table__pager">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="(value: number) => emit('update:page', value)"
        @size-change="(value: number) => emit('update:pageSize', value)"
      />
    </div>
  </div>
</template>

<style scoped>
.data-table__pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
