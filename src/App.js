/* global chrome */
import React from "react";
import ReactDOM from "react-dom";
import { Table } from "react-bootstrap";
import Moment from "react-moment";
import "./App.css";

function App() {
  return (
    <div className="App">
      <main className="h-100 w-100">
        <Loading />
      </main>
    </div>
  );
}

function Loading() {
  loadTables();
  const element = (
    <div className="center-main">
      <div>
        <div
          className="spinner-grow text-light width: 3rem; height: 3rem;"
          role="status"
        />
        <p className="text-light">온라인 출석 조회 불러오는 중...</p>
      </div>
      <p className="text-success" id="term">
        최근 학기 불러오는 중...
      </p>
    </div>
  );
  return element;
}

async function loadTables() {
  try {
    await UpdateAttendanceTables();
  } catch (err) {
    const errorElement = (
      <div class="alert alert-warning" role="alert">
        {err.message}
      </div>
    );
    ReactDOM.render(errorElement, document.querySelector("main"));
  }
}

function RenderMainTables(courseTables) {
  const element = <DrawAllTable data={courseTables} />;
  document.querySelector("main").classList.remove("h-100");
  ReactDOM.render(element, document.querySelector("main"));

  let names = document.getElementsByClassName("grade-name");
  for (let tag of names) {
    tag.addEventListener("click", () => {
      const link = tag.getAttribute("link");
      chrome.tabs.create({ url: link, active: false });
    });
  }

  names = document.getElementsByClassName("video-name");
  for (let tag of names) {
    tag.addEventListener("click", async () => {
      const courseId = tag.getAttribute("courseid");
      const pos = tag.getAttribute("pos");
      const videoName = tag.getAttribute("videoname");
      const link = await GetCourseVideoUrl(courseId, pos, videoName);
      if (link == "") {
        alert("강의 영상을 찾을 수 없습니다");
        return;
      }
      chrome.tabs.create({ url: link, active: false });
    });
  }
}

async function UpdateAttendanceTables() {
  const userKey = await GetUserKey();
  const coursesData = await GetCourses(userKey);
  const courses = coursesData["courses"];
  let termList = coursesData["termList"];
  // 내림차순 정렬
  // TODO:  /learn/api/v1/terms API 사용
  termList.sort((a, b) => {
    return Number(b.replace(/[^0-9]/g, "")) - Number(a.replace(/[^0-9]/g, ""));
  });
  const targetTerm = termList[0];
  const targetTermElement = <div class="target-term">{targetTerm}</div>;
  ReactDOM.render(targetTermElement, document.querySelector("#term"));
  const targetCourses = courses.filter((course) => course.term === targetTerm);

  let courseTables = [];
  for (const course of targetCourses) {
    console.log(`${course["name"]} 온라인 출석 조회...`);
    const courseAttendance = await GetCourseAttendance(
      course["id"],
      course["name"]
    );
    const courseGrades = await GetGrades(course["id"], userKey);
    console.log(courseGrades);
    console.log(courseAttendance);
    courseTables.push([courseAttendance, courseGrades]);
  }
  RenderMainTables(courseTables);

  return userKey;
}

async function GetResponse(url) {
  try {
    return await fetch(url, {
      credentials: "same-origin",
      mode: "no-cors",
    });
  } catch (err) {
    throw new Error(`fetch 실패. url:${url}`);
  }
}

async function GetCourseAttendance(id, name) {
  // LTI 도구 실행에 필요한 form 추출
  let formElement = await (async function () {
    const url = `https://learn.hanyang.ac.kr/webapps/blackboard/execute/blti/launchPlacement?blti_placement_id=_17_1&course_id=${id}&from_ultra=true`;
    const rep = await GetResponse(url);
    const html = await rep.text();
    let parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return doc.getElementById("bltiLaunchForm");
  })();

  const url = formElement.getAttribute("action");
  let data = new URLSearchParams();
  for (const pair of new FormData(formElement)) {
    data.append(pair[0], pair[1]);
  }
  data.append("showAll", "true");

  const rep = await fetch(url, {
    credentials: "same-origin",
    mode: "no-cors",
    method: "post",
    body: data,
  });
  const html = await rep.text();

  let parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const ele = doc.getElementById("listContainer_databody");
  let courseAttendance = {
    id: id,
    name: name,
    data: [],
  };
  if (ele) {
    Array.from(ele.rows).forEach((child) => {
      let data = [];
      Array.from(child.getElementsByTagName("td")).forEach((td) => {
        data.push(
          td.getElementsByClassName("table-data-cell-value")[0].innerText
        );
      });
      courseAttendance["data"].push([data[0], data[1], data[6]]);
    });
  }
  return courseAttendance;
}

async function GetCourses(userKey) {
  const url = `https://learn.hanyang.ac.kr/learn/api/v1/users/${userKey}/memberships?expand=course.effectiveAvailability,course.permissions,courseRole&includeCount=true&limit=10000`;
  const rep = await GetResponse(url);
  let result = [];
  let termList = [];
  const json = await rep.json();
  json["results"].forEach((course) => {
    course = course["course"];
    const data = {
      name: course["name"],
      id: course["id"],
      courseId: course["courseId"],
      term: "term" in course ? course["term"]["name"] : null,
    };
    if (data["term"] && !termList.includes(data["term"])) {
      termList.push(data["term"]);
    }
    result.push(data);
  });
  return {
    courses: result,
    termList: termList,
  };
}

async function GetUserKey() {
  const url = "https://learn.hanyang.ac.kr/learn/api/v1/users/me";
  const rep = await GetResponse(url);
  const json = await rep.json();
  if ("id" in json) {
    return json["id"];
  }
  console.error(json);
  throw new Error("사용자 ID를 찾을 수 없습니다.");
}

async function GetCourseVideoUrl(id, folderTitle, videoTitle) {
  async function GetChildren(rootId) {
    const url = `https://learn.hanyang.ac.kr/learn/api/v1/courses/${id}/contents/${rootId}/children?@view=Summary&expand=assignedGroups,selfEnrollmentGroups.group,gradebookCategory&limit=10000`;
    const rep = await GetResponse(url);
    const contents = (await rep.json())["results"];
    return contents;
  }

  const children = await GetChildren("ROOT");
  let result = "";
  for (const now of children) {
    if (
      now["title"] === folderTitle &&
      "resource/x-bb-folder" === now["contentHandler"] &&
      !now["contentDetail"]["resource/x-bb-folder"]["isBbPage"] &&
      now["contentDetail"]["resource/x-bb-folder"]["isFolder"]
    ) {
      const contents = await GetChildren(now["id"]);
      for (const content of contents) {
        if (
          content["title"] === videoTitle &&
          "resource/x-bb-externallink" === content["contentHandler"]
        ) {
          result =
            content["contentDetail"]["resource/x-bb-externallink"]["url"];
        }
      }
    }
  }

  return result;
}

async function GetCourseStructure(id) {
  async function GetChildren(rootId) {
    const url = `https://learn.hanyang.ac.kr/learn/api/v1/courses/${id}/contents/${rootId}/children?@view=Summary&expand=assignedGroups,selfEnrollmentGroups.group,gradebookCategory&limit=10000`;
    const rep = await GetResponse(url);
    const contents = (await rep.json())["results"];
    return contents;
  }
  let st = [];
  let root = [
    "ROOT",
    {
      name: "ROOT",
      children: [],
      contents: [],
      contentDetail: "",
      courseVideos: [],
    },
  ];
  st.push(root);

  while (st.length > 0) {
    let [id, parent] = st.pop();
    const children = await GetChildren(id);
    for (const now of children) {
      if (!("contentDetail" in now)) {
        console.error(`contentDetail does not exist\n${now}`);
        return;
      }

      let content = {
        name: now["title"],
        children: [],
        contents: [],
        contentDetail: now["contentDetail"],
      };

      //"resource/x-bb-lesson" 학생용 가이드
      //"resource/x-bb-file" 다운로드 가능한 파일
      //"resource/x-bb-asmt-test-link" 과제
      // 폴더
      if (
        "resource/x-bb-folder" === now["contentHandler"] &&
        !now["contentDetail"]["resource/x-bb-folder"]["isBbPage"] &&
        now["contentDetail"]["resource/x-bb-folder"]["isFolder"]
      ) {
        st.push([now["id"], content]);
        console.log(st);
        parent["children"].push(content);
      } else {
        // 파일, 영상, 비디오는 따로 구현하지 않음
        // TODO: 다운로드 기능 필요해지면 그때 구현할 것
        // 일단 다 넣음
        parent["contents"].push(now);
        if ("resource/x-bb-externallink" === now["contentHandler"]) {
          const url = now["contentDetail"]["resource/x-bb-externallink"]["url"];
          if (url) {
            root[1]["courseVideos"].push({
              name: content["name"],
              url: url,
            });
          } else {
            console.error(`Invalid externallink\n${now}`);
          }
        }
      }
    }
  }

  return root;
}

async function GetGrades(id, userId) {
  async function GetGradeBookGrades() {
    const url = `https://learn.hanyang.ac.kr/learn/api/v1/courses/${id}/gradebook/grades?limit=100&userId=${userId}`;
    // expand=attemptsLeft
    const rep = await GetResponse(url);
    const json = await rep.json();
    const results = json["results"];
    return results;
  }

  async function GetGradeBookColumns() {
    const url = `https://learn.hanyang.ac.kr/learn/api/v1/courses/${id}/gradebook/columns?expand=associatedRubrics,collectExternalSubmissions,gradebookCategory&includeInvisible=false`;
    // expand=attemptsLeft
    const rep = await GetResponse(url);
    const json = await rep.json();
    const results = json["results"];
    return results;
  }

  async function GetAttemptData(attemptUrl) {
    const rep = await GetResponse(attemptUrl);
    const json = await rep.json();
    return json;
  }

  const grades = await GetGradeBookGrades();
  const columns = await GetGradeBookColumns();

  let result = [];

  for (let column of columns) {
    const name = column["columnName"];
    if (name === "출석") {
      continue;
    }
    const dueDate = column["dueDate"]; // 9시간 추가
    const columnId = column["id"];
    let lastAttemptId = "";
    let lastAttemptUrl = "";
    for (const grade of grades) {
      if (grade["columnId"] === columnId) {
        lastAttemptId = grade["lastAttemptId"];
        lastAttemptUrl = grade["lastAttemptUrl"];
      }
    }
    if (lastAttemptId === "") {
      // TODO: 예외 처리
      console.error(column);
    }

    const attemptData = await GetAttemptData(lastAttemptUrl);

    const status = {
      NOT_ATTEMPTED: {
        name: "시도하지 않음",
        grade: false,
      },
      ABANDONED: {
        name: "포기함",
        grade: false,
      },
      IN_PROGRESS: {
        name: "진행중",
        grade: false,
      },
      SUSPENDED: {
        name: "유보됨",
        grade: false,
      },
      CANCELLED: {
        name: "취소됨",
        grade: false,
      },
      NEEDS_GRADING: {
        name: "채점중",
        grade: true,
      },
      COMPLETED: {
        name: "완료됨",
        grade: true,
      },
      IN_MORE_PROGRESS: {
        name: "추가 진행 필요",
        grade: false,
      },
      NEEDS_MORE_GRADING: {
        name: "추가 채점 필요",
        grade: false,
      },
    };

    result.push({
      name: name,
      dueDate: dueDate,
      columnId: columnId,
      lastAttemptid: lastAttemptId,
      lastAttemptUrl: "",
      attempt: attemptData,
      contentId: column["contentId"],
      contentUrl: `https://learn.hanyang.ac.kr/ultra/courses/${id}/outline/assessment/${column["contentId"]}/overview?courseId=${id}`,
      status: status[attemptData["status"]],
    });
  }

  return result;
}

function DrawAllTable(probs) {
  return (
    <div>
      {probs.data.map((course, _) => (
        <AttendanceTable
          title={course[0].name}
          data={course[0].data}
          grade={course[1]}
          courseId={course[0].id}
          key={course.id}
        />
      ))}
    </div>
  );
}

function AttendanceTable(probs) {
  return (
    <div>
      <p className="text-white Table-title">{probs.title}</p>
      <AttendanceTableContent data={probs.data} courseId={probs.courseId} />
      <GradeTableContent data={probs.grade} />
    </div>
  );
}

function AttendanceTableContent(probs) {
  if (probs.data.length === 0) {
    return <div className="text-white">강의 영상이 없습니다</div>;
  }
  return (
    <Table responsive="lg" size="sm" variant="dark" bordered>
      <thead>
        <tr>
          <th>위치</th>
          <th>컨텐츠명</th>
          <th>P/F</th>
        </tr>
      </thead>
      <tbody>
        {probs.data.map((row, idx) => (
          <tr key={idx}>
            {row.map((ele, idx) => (
              <td
                key={idx}
                className={
                  (row[2] === "F" ? "text-warning" : "text-success") +
                  (idx === 1 ? " video-name" : "")
                }
                pos={row[0]}
                videoname={row[1]}
                courseid={probs.courseId}
              >
                {ele}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function GradeTableContent(probs) {
  if (probs.data.length === 0) {
    return <div></div>;
  }
  return (
    <Table responsive="lg" size="sm" variant="dark" bordered>
      <thead>
        <tr>
          <th>과제명</th>
          <th>마감</th>
          <th>상태</th>
        </tr>
      </thead>
      <tbody>
        {probs.data.map((row, idx) => (
          <tr
            key={idx}
            className={row["status"]["grade"] ? "text-success" : "text-warning"}
          >
            <td className="grade-name" link={row["contentUrl"]}>
              {row["name"]}
            </td>
            <td>
              <Moment local format="yyyy-MM-DD HH:mm">
                {row["dueDate"]}
              </Moment>
            </td>
            <td>{row["status"]["name"]}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default App;
