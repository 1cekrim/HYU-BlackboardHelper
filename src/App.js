import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom'
import { Button, Table } from 'react-bootstrap'
import './App.css';


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
        <div className="spinner-grow text-light width: 3rem; height: 3rem;" role="status" />
        <p className="text-light">온라인 출석 조회 불러오는 중...</p>
      </div>
      <p className="text-success" id="term">최근 학기 불러오는 중...</p>
    </div>
  )
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
    )
    ReactDOM.render(errorElement, document.querySelector('main'));
  }
}

async function UpdateAttendanceTables() {
  const userKey = await GetUserKey();
  const coursesData = await GetCourses(userKey);
  const courses = coursesData['courses'];
  let termList = coursesData['termList'];
  // 내림차순 정렬
  // TODO:  /learn/api/v1/terms API 사용
  termList.sort((a, b) => {
    return Number(b.replace(/[^0-9]/g, "")) - Number(a.replace(/[^0-9]/g, ""));
  })
  const targetTerm = termList[0];
  const targetTermElement = (
    <div class="target-term">
      {targetTerm}
    </div>
  )
  ReactDOM.render(targetTermElement, document.querySelector('#term'));
  const targetCourses = courses.filter(course => course.term === targetTerm);

  let courseTables = []
  for (const course of targetCourses) {
    console.log(`${course['name']} 온라인 출석 조회...`);
    const courseAttendance = await GetCourseAttendance(course['id'], course['name']);
    // const courseStructure = await GetCourseStructure(course['id'], course['name']);
    const courseGrades = await GetGrades(course['id'], userKey);
    console.log(courseGrades);
    console.log(courseAttendance);
    courseTables.push(courseAttendance);
  }
  console.log(courseTables);
  const element = (
    <DrawAllTable data={courseTables} />
  );
  document.querySelector('main').classList.remove('h-100');
  ReactDOM.render(element, document.querySelector('main'));
  return userKey;
}

async function GetResponse(url) {
  return await fetch(url, {
    credentials: "same-origin",
    mode: "no-cors"
  });
}

async function GetCourseAttendance(id, name) {
  // LTI 도구 실행에 필요한 form 추출
  let formElement = await (async function () {
    const url = `https://learn.hanyang.ac.kr/webapps/blackboard/execute/blti/launchPlacement?blti_placement_id=_17_1&course_id=${id}&from_ultra=true`;
    const rep = await GetResponse(url);
    const html = await rep.text();
    let parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return doc.getElementById('bltiLaunchForm');
  })();
  
  const url = formElement.getAttribute('action');
  let data = new URLSearchParams();
  for (const pair of new FormData(formElement)) {
      data.append(pair[0], pair[1]);
  }
  data.append('showAll', 'true');

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
    "id": id,
    "name": name,
    "data": []
  }
  if (ele) {
    Array.from(ele.rows).forEach(child => {
      let data = []
      Array.from(child.getElementsByTagName('td')).forEach(td => {
        data.push(td.getElementsByClassName('table-data-cell-value')[0].innerText)
      })
      courseAttendance["data"].push([data[0], data[1], data[6]]);
    })
  }
  return courseAttendance;
}

async function GetCourses(userKey) {
  const url = `https://learn.hanyang.ac.kr/learn/api/v1/users/${userKey}/memberships?expand=course.effectiveAvailability,course.permissions,courseRole&includeCount=true&limit=10000`;
  const rep = await GetResponse(url);
  let result = [];
  let termList = [];
  const json = await rep.json();
  json['results'].forEach(course => {
    course = course['course'];
    const data = {
      'name': course['name'],
      'id': course['id'],
      'courseId': course['courseId'],
      'term': 'term' in course ? course['term']['name'] : null
    }
    if (data['term'] && !termList.includes(data['term'])) {
      termList.push(data['term']);
    }
    result.push(data);
  });
  return {
    "courses": result,
    "termList": termList
  };
}

async function GetUserKey() {
  const url = "https://learn.hanyang.ac.kr/learn/api/v1/users/me";
  const rep = await GetResponse(url);
  const json = await rep.json();
  if ('id' in json) {
    return json['id'];
  }
  console.error(json);
  throw new Error("사용자 ID를 찾을 수 없습니다.");
  return null;
}

async function GetCourseStructure(id, name) {
  async function GetChildren(rootId) {
    const url = `https://learn.hanyang.ac.kr/learn/api/v1/courses/${id}/contents/${rootId}/children?@view=Summary&expand=assignedGroups,selfEnrollmentGroups.group,gradebookCategory&limit=10000`
    const rep = await GetResponse(url);
    const contents = (await rep.json())['results']
    return contents;
  }
  let st = []
  let root = ['ROOT', {
    'name': 'ROOT',
    'children': [],
    'contents': [],
    'contentDetail': ''
  }]
  st.push(root);

  while (st.length > 0) {
    let [id, parent] = st.pop();
    const children = await GetChildren(id);
    children.forEach(now => {
      if (!('contentDetail' in now)) {
        console.error(`contentDetail does not exist\n${now}`);
        return;
      }

      let content = {
        'name': now['title'],
        'children': [],
        'contents': [],
        'contentDetail': now['contentDetail']
      };

      //"resource/x-bb-lesson" 학생용 가이드
      //"resource/x-bb-file" 다운로드 가능한 파일
      //"resource/x-bb-asmt-test-link" 과제
      // genericReadOnlyData->dueDate: 과제 마감 기한
      // 9시간 더해야 함!!!!
      //  '' ->hasGradeColumn: gradingColumn유무?
      // 과제->test->assessment->gradingColumn
        // columnName: 과제명
        // dueDate: 과제 마감 기한
      //  /learn/api/v1/courses/_38929_1/gradebook/columns/_332121_1/grades/_2868288_1/attempts?fields=id,status,attemptDate 
      // _332121_1: gradingColumn.gradebookCategory.id
      // {"results":[{"attemptDate":"2020-09-19T05:09:06.856Z","id":"_2289349_1","status":"IN_PROGRESS"}],"paging":{"previousPage":"","nextPage":"","count":1,"limit":1000,"offset":0},"permissions":{"createAttempt":false,"deleteAttempt":false,"viewAttempt":true,"editAttempt":false}}

      // 폴더
      if ('resource/x-bb-folder' == now['contentHandler'] && !now['contentDetail']['resource/x-bb-folder']['isBbPage'] && now['contentDetail']['resource/x-bb-folder']['isFolder']) {
        st.push([now['id'], content]);
        console.log(st);
        parent['children'].push(content);
      }
      // else if ('resource/x-bb-file' in now['contentDetail']) {

      // }
      else {
        // 파일, 영상, 비디오는 따로 구현하지 않음
        // TODO: 다운로드 기능 필요해지면 그때 구현할 것
        // 일단 다 넣음
        parent['contents'].push(now);
      }
    });
  }

  return root;
}

async function GetGrades(id, userId) {
  async function GetGradeBookGrades() {
    const url = `https://learn.hanyang.ac.kr/learn/api/v1/courses/${id}/gradebook/grades?limit=100&userId=${userId}`;
    // expand=attemptsLeft
    const rep = await GetResponse(url);
    const json = await rep.json();
    const results = json['results'];
    return results;
  }

  async function GetGradeBookColumns() {
    const url = `https://learn.hanyang.ac.kr/learn/api/v1/courses/${id}/gradebook/columns?expand=associatedRubrics,collectExternalSubmissions,gradebookCategory&includeInvisible=false`;
    // expand=attemptsLeft
    const rep = await GetResponse(url);
    const json = await rep.json();
    const results = json['results'];
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
    const name = column['columnName'];
    if (name == '출석') {
      continue;
    }
    const dueDate = column['dueDate']; // 9시간 추가
    const columnId = column['id'];
    let lastAttemptId = ''
    let lastAttemptUrl = ''
    for (const grade of grades) {
      if (grade['columnId'] == columnId) {
        lastAttemptId = grade['lastAttemptId'];
        lastAttemptUrl = grade['lastAttemptUrl'];
      }
    }
    if (lastAttemptId == '') {
      // TODO: 예외 처리
      console.error(column);
    }

    const attemptData = await GetAttemptData(lastAttemptUrl);
    // NOT_ATTEMPTED (deprecated)
    // ABANDONED (deprecated)
    // IN_PROGRESS
    // SUSPENDED
    // CANCELLED (deprecated)
    // NEEDS_GRADING
    // COMPLETED
    // IN_MORE_PROGRESS
    // NEEDS_MORE_GRADING
    
    result.push({
      'name': name,
      'dueDate': dueDate,
      'columnId': columnId,
      'lastAttemptid': lastAttemptId,
      'lastAttemptUrl': '',
      'attempt': attemptData
    })
  }

  return result;
}

function DrawAllTable(probs) {
  return (
    <div>
      {probs.data.map((course, _) => (
        <AttendanceTable title={course.name} data={course.data} key={course.id}/>
      ))}
    </div>
  );
}

function AttendanceTable(probs) {
  return (
    <div>
      <p className="text-white Table-title">{probs.title}</p>
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
              {row.map((ele, idx) => 
                (<td key={idx} className={row[2]==='F' ? 'text-warning' : 'text-success'}>{ele}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default App;
