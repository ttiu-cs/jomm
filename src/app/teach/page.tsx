import { redirect } from "next/navigation";

// Teaching now lives inside the seller app.
export default function Page() {
  redirect("/seller");
}
