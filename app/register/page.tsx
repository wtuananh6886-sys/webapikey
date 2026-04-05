import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <AuthShell
      title="Gia nhập Nexora-API — bắt đầu hành trình vận hành key."
      description="Form gọn, phản hồi rõ ràng, tối ưu touch. Quyền owner/admin do quản trị viên cấp sau khi xác minh."
    >
      <RegisterForm />
    </AuthShell>
  );
}
