import React, { useState, useEffect, ReactNode } from 'react';
import { adminDb } from './firebase-admin-config';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function AppGuard({ children }: { children: ReactNode }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [detectedEmail, setDetectedEmail] = useState('');
  const [inputPw, setInputPw] = useState('');
  const [correctPw, setCorrectPw] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initGuard = async () => {
      try {
        // 1. 주소창 파라미터(?u=) 확인
        const params = new URLSearchParams(window.location.search);
        const emailParam = params.get('u');
       
        // 2. 브라우저 저장소(localStorage)에서 기존 기록 확인
        const savedEmail = localStorage.getItem('user_email');
        const savedAuth = localStorage.getItem('app_access_token');

        // 우선순위: 주소창 이메일 > 저장된 이메일
        const currentEmail = emailParam ? decodeURIComponent(emailParam) : savedEmail;
        if (currentEmail) setDetectedEmail(currentEmail);

        // 3. 서버에서 마스터 비밀번호 로드
        const docRef = doc(adminDb, "config", "globalConfig");
        const docSnap = await getDoc(docRef);
        let serverPw = "";
        if (docSnap.exists()) {
          serverPw = docSnap.data().currentPassword;
          setCorrectPw(serverPw);
        }

        // 4. [핵심] 자동 접속 로직
        // 저장된 토큰이 'true'이고 이메일이 있다면 DB에서 실시간 검증 후 자동 통과
        if (savedAuth === 'true' && currentEmail) {
          const usersRef = collection(adminDb, "users");
          const q = query(usersRef, where("email", "==", currentEmail.trim()));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            const now = new Date();
            const expiryDate = new Date(userData.subscriptionEndDate);

            // 기간이 남았거나 관리자라면 자동 승인
            if (now <= expiryDate || userData.role === 'admin') {
              setIsAuthorized(true);
            } else {
              // 기간 만료 시 저장 정보 삭제
              localStorage.removeItem('app_access_token');
            }
          }
        }
      } catch (e) {
        console.error("인증 로드 중 오류:", e);
      } finally {
        setLoading(false);
      }
    };

    initGuard();
  }, []);

  const handleLogin = async () => {
    if (!detectedEmail) {
      alert("접속 정보(이메일)가 없습니다. 본점을 통해 다시 접속해주세요.");
      return;
    }

    try {
      // 1. 비번 대조
      if (inputPw !== correctPw) {
        alert("비밀번호가 틀렸습니다.");
        setInputPw('');
        return;
      }

      // 2. DB 최종 확인 (이메일 존재 및 기간)
      const usersRef = collection(adminDb, "users");
      const q = query(usersRef, where("email", "==", detectedEmail.trim()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert("승인되지 않은 이메일입니다.");
        return;
      }

      const userData = querySnapshot.docs[0].data();
      const now = new Date();
      const expiryDate = new Date(userData.subscriptionEndDate);

      if (now > expiryDate && userData.role !== 'admin') {
        alert(`이용 기간이 만료되었습니다. (~${expiryDate.toLocaleDateString()})`);
        return;
      }

      // 3. 인증 성공 - 정보 저장 (자동 로그인 활성화)
      setIsAuthorized(true);
      localStorage.setItem('app_access_token', 'true');
      localStorage.setItem('user_email', detectedEmail);
    } catch (e) {
      alert("서버 연결 실패. 잠시 후 다시 시도해주세요.");
    }
  };

  // 로그아웃 (테스트용 또는 필요시 호출)
  const handleLogout = () => {
    localStorage.removeItem('app_access_token');
    localStorage.removeItem('user_email');
    window.location.reload();
  };

  if (loading) return <div style={containerStyle}><div className="spinner"></div></div>;

  if (!isAuthorized) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{fontSize: '40px', marginBottom: '10px'}}>👤</div>
          <h2 style={titleStyle}>WELCOME</h2>
          <p style={subtitleStyle}>
            {detectedEmail ? <strong>{detectedEmail}</strong> : "로그인이 필요합니다."}
          </p>
         
          {detectedEmail ? (
            <>
              <input
                type="password"
                value={inputPw}
                onChange={(e) => setInputPw(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                style={inputStyle}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              <button onClick={handleLogin} style={buttonStyle}>입장하기</button>
            </>
          ) : (
            <button
              onClick={() => window.location.href = "https://bang-guseog.com"}
              style={buttonStyle}
            >
              본점에서 로그인하기
            </button>
          )}
        </div>
        <style>{`
          .spinner { width: 40px; height: 40px; border: 4px solid #333; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // 인증 성공 시 실제 서비스 화면 출력 (로그아웃 버튼 예시 포함 가능)
  return (
    <>
      {/* <button onClick={handleLogout} style={{position:'fixed', bottom:10, right:10}}>로그아웃</button> */}
      {children}
    </>
  );
}

// 스타일 정의 (어두운 테마)
const containerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#121212', color: '#fff', fontFamily: 'sans-serif' };
const cardStyle: React.CSSProperties = { padding: '40px', backgroundColor: '#1e1e1e', borderRadius: '24px', textAlign: 'center', width: '90%', maxWidth: '380px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' };
const titleStyle: React.CSSProperties = { fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' };
const subtitleStyle: React.CSSProperties = { fontSize: '15px', color: '#aaa', marginBottom: '30px' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #333', backgroundColor: '#2a2a2a', color: '#fff', fontSize: '16px', marginBottom: '15px', boxSizing: 'border-box', textAlign: 'center' };
const buttonStyle: React.CSSProperties = { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#007bff', color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' };
