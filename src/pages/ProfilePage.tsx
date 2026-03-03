import { useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import { useNavigate } from "react-router-dom";

function ProfilePage() {
  const { address } = useAccount();
  const navigate = useNavigate();

  useEffect(() => {
    if (address) {
      navigate(`/collection/${address}`, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [address, navigate]);

  return null;
}

export default ProfilePage;
