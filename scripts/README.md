# 🛠️ Database Utility Scripts

Các scripts hỗ trợ quản lý và bảo trì database.

## Scripts Available

### 1. `check_db.js` - Kiểm tra Database
Kiểm tra kết nối, schema, và trạng thái database.

```bash
npm run db:check
```

**Output:**
- Kiểm tra kết nối database
- Liệt kê tất cả các bảng
- Hiển thị cấu trúc bảng users
- Đếm số lượng records trong mỗi bảng

### 2. `reset_db.js` - Reset Database
⚠️ **CẢNH BÁO**: Xóa toàn bộ dữ liệu và tạo lại schema mới.

```bash
npm run db:reset
```

Yêu cầu gõ "RESET" để xác nhận.

**Sử dụng khi:**
- Development/Testing: Cần làm sạch database
- Có lỗi migration không thể sửa
- Muốn bắt đầu lại từ đầu

### 3. `cleanup_operations.js` - Dọn dẹp Operations
Xóa các operations cũ và không cần thiết để tối ưu database.

```bash
npm run db:cleanup
```

**Thực hiện:**
- Xóa operations cũ hơn 30 ngày
- Xóa các stroke updates trùng lặp (giữ lại mới nhất)
- Xóa operations của boards không tồn tại
- Tối ưu database (VACUUM ANALYZE)

**Nên chạy định kỳ** (ví dụ: hàng tuần) để giữ database gọn nhẹ.

## Usage Examples

### Development Workflow

```bash
# Setup ban đầu
npm run db:migrate

# Kiểm tra xem database đã OK chưa
npm run db:check

# Sau một thời gian development, muốn bắt đầu lại
npm run db:reset

# Dọn dẹp định kỳ
npm run db:cleanup
```

### Production Maintenance

```bash
# Kiểm tra health định kỳ
npm run db:check

# Cleanup hàng tuần (setup cron job)
0 2 * * 0 cd /path/to/server && npm run db:cleanup
```

## Cron Job Setup (Linux)

Để tự động dọn dẹp operations mỗi tuần:

```bash
# Mở crontab
crontab -e

# Thêm dòng (chạy mỗi Chủ nhật 2 giờ sáng)
0 2 * * 0 cd /var/www/peertask/server && npm run db:cleanup >> /var/log/peertask-cleanup.log 2>&1
```

## Windows Task Scheduler

1. Mở Task Scheduler
2. Tạo Basic Task
3. Trigger: Weekly, Sunday, 2:00 AM
4. Action: Start a program
   - Program: `npm`
   - Arguments: `run db:cleanup`
   - Start in: `D:\path\to\server`

## Notes

- Tất cả scripts đều require file `.env` đã được cấu hình đúng
- Scripts sẽ tự động kết nối vào database qua `DATABASE_URL`
- Luôn backup database trước khi chạy `db:reset`
- `db:cleanup` an toàn để chạy trên production

## Troubleshooting

**Lỗi kết nối:**
```
Error: connect ECONNREFUSED
```
→ Kiểm tra PostgreSQL đang chạy và `DATABASE_URL` trong `.env`

**Permission denied:**
```
Error: permission denied
```
→ Kiểm tra database user có đủ quyền

**Migration failed:**
```
Error: relation "users" does not exist
```
→ Chạy `npm run db:migrate` để tạo schema
